const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { GoogleSpreadsheetWorksheet } = require("google-spreadsheet");
const { ChatInputCommandInteraction } = require("discord.js");

const CONFIG = {
    SHEET_START_ROW: 3,
    SHEET_END_ROW: 210,
    SHEET_TITLE: "Schedule",
    PLAYER_SHEET: "PlayerList",
    STAFF_SHEET: "staffList",
    TIMEZONE_OFFSET_GMT8: "GMT+08:00",
    COOLDOWN_SECONDS: 300,
};
const bracketMatchSheetId = "1G1TN3dSdprXAkkttmQAce2o-SRCFil_PeGo9iPVGTy4";
const cooldownMap = new Map<string, number>();
const logChannelId = "1499060711072989184";

const convertFraction = (time: number): number => {
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return (hours + minutes / 60) / 24;
};

const convertDateFormat = (dateStr: string): number => {
    const parts = dateStr.split("-");
    if (!parts[0] || !parts[1]) throw new Error("Invalid date format");

    const year = new Date().getFullYear();
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);

    const newDate = new Date(year, month - 1, day);
    const timezoneOffset = newDate.getTimezoneOffset() * 60 * 1000;

    return ((newDate.getTime() - timezoneOffset) / (1000 * 60 * 60 * 24)) + 25569;
};

const convertDate = (dateMatch: string, timeMatch: number): Date | null => {
    const [m, d] = (dateMatch || "").split("-");
    const month = Number(m);
    const day = Number(d);

    if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const year = new Date().getFullYear();
    let hours = 0, minutes = 0;

    if (timeMatch) {
        hours = Math.floor(Number(timeMatch) / 100);
        minutes = Number(timeMatch) % 100;
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    }

    const date = new Date(year, month - 1, day, hours, minutes);
    return !isNaN(date.getTime()) ? date : null;
};

const getUsernameFromDiscordId = (playerSheet: typeof GoogleSpreadsheetWorksheet, discordId: string): string | null => {
    for (let r = 1; r <= 200; r++) {
        const discordIdCell = playerSheet.getCellByA1(`F${r}`).value;
        if (discordIdCell?.toString().trim() === discordId) {
            return playerSheet.getCellByA1(`A${r}`).value?.toString() || null;
        }
    }
    return null;
}

const getDiscordIdFromUsername = (playerSheet: typeof GoogleSpreadsheetWorksheet, username: string): string | null => {
    for (let r = 1; r <= 200; r++) {
        const usernameCell = playerSheet.getCellByA1(`A${r}`).value;
        if (usernameCell?.toString() === username) {
            return playerSheet.getCellByA1(`F${r}`).value?.toString() || null;
        }
    }
    return null;
}

const getStaffidFromUsername = (staffSheet: typeof GoogleSpreadsheetWorksheet, username: string): string | null => {
    for (let r = 1; r <= 100; r++) {
        const usernameCell = staffSheet.getCellByA1(`A${r}`).value;
        if (usernameCell?.toString() === username) {
            return staffSheet.getCellByA1(`B${r}`).value?.toString() || null;
        }
    }
    return null;
};

const toDiscordTimestamp = (date: Date): string => {
    const unix = Math.floor(date.getTime() / 1000) - 8 * 60 * 60;
    return `<t:${unix}:f>`;
};

const getMatchRow = (sheet: typeof GoogleSpreadsheetWorksheet, username: string, matchId: string) => {
    for (let row = CONFIG.SHEET_START_ROW; row <= CONFIG.SHEET_END_ROW; row++) {

        const id = sheet.getCellByA1(`B${row}`).value;
        const player1 = sheet.getCellByA1(`F${row}`).value?.toString();
        const player2 = sheet.getCellByA1(`I${row}`).value?.toString();

        const isParticipant = player1 === username || player2 === username;

        if (isParticipant && id === matchId) {
            return {
                row,
                id,
                player1,
                player2,

                hasDate: typeof sheet.getCellByA1(`D${row}`).value === "number",
                hasTime: typeof sheet.getCellByA1(`E${row}`).value === "number",
            };
        }
    }
    return null;
};

const getStaffNames = (sheet: typeof GoogleSpreadsheetWorksheet, matchId: string): { referee: string | null, streamer: string | null } | null => {
    for (let row = CONFIG.SHEET_START_ROW; row <= CONFIG.SHEET_END_ROW; row++) {
        const id = sheet.getCellByA1(`B${row}`).value;
        if (id === matchId) {
            const refereeCell = sheet.getCellByA1(`J${row}`).value;
            const streamerCell = sheet.getCellByA1(`K${row}`).value;
            return {
                referee: refereeCell ? refereeCell.toString() : null,
                streamer: streamerCell ? streamerCell.toString() : null
            };
        }
    }
    return null;
};

export const data = new SlashCommandBuilder()
    .setName("reschedule")
    .setDescription("Reschedule a match")
    .addStringOption((opt: any) =>
        opt.setName("matchid")
            .setDescription("Match ID from the schedule sheet")
            .setRequired(true)
    )
    .addStringOption((opt: any) =>
        opt.setName("newtime")
            .setDescription("Time 24h format (e.g. 1900)")
            .setRequired(true)
    )
    .addStringOption((opt: any) =>
        opt.setName("newmonth")
            .setDescription("Month (e.g. 08)")
            .setRequired(true)
            .addChoices([
                { name: "Jun", value: "06" },
                { name: "Jul", value: "07" },
                { name: "Aug", value: "08" }
            ])
    )
    .addStringOption((opt: any) =>
        opt.setName("newday")
            .setDescription("Day (e.g. 15)")
            .setRequired(true)
    );

export async function execute(interaction: typeof ChatInputCommandInteraction) {
    // Cooldown check
    const userId = interaction.user.id;
    const now = Date.now();

    if (isOnCooldown(userId, now)) {
        const timeLeft = getCooldownRemaining(userId, now);
        await handleCooldownResponse(interaction, timeLeft);
        return;
    }

    // Set cooldown and defer reply
    cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);
    await interaction.deferReply();

    try {
        // Extract options
        const {
            matchId,
            newTimeStr,
            newMonthStr,
            newDayStr
        } = extractInteractionOptions(interaction);

        // Validate date and time
        const newDateStr = `${newMonthStr}-${newDayStr}`;
        const dateObj = convertDate(newDateStr, newTimeStr);

        if (!dateObj) {
            throw new Error("Invalid date/time format.");
        }

        // Validate date range
        validateDateRange(dateObj, "06-02", "06-15", "June 2", "June 15");

        // Load documents and sheets
        const [doc, playerSheet, sheet] = await loadSheets();

        // Verify player identity
        const username = getUsernameFromDiscordId(playerSheet, userId);
        if (!username) {
            throw new Error("Could not find your Discord ID in the registered player list.");
        }

        // Find and validate match
        const match = getMatchRow(sheet, username, matchId);
        if (!match || !match.hasTime || !match.hasDate) {
            throw new Error(`Match ID **${matchId}** not found, or you are not a player in it.`);
        }

        // Get opponent details
        const opponentUsername = username === match.player1 ? match.player2 : match.player1;
        const opponentId = getDiscordIdFromUsername(playerSheet, opponentUsername);
        if (!opponentId) {
            throw new Error("Could not find opponent Discord ID.");
        }

        // Prepare reschedule request
        const discordTs = toDiscordTimestamp(dateObj);
        const messageContent = formatRescheduleMessage(matchId, opponentId, interaction.user.id, discordTs);
        const actionRow = createActionRow();

        // Send request and handle response
        const sentMessage = await interaction.editReply({
            content: messageContent,
            components: [actionRow]
        });

        await handleRescheduleResponse(
            sentMessage,
            opponentId,
            match,
            newTimeStr,
            newDateStr,
            discordTs,
            sheet,
            playerSheet
        );

    } catch (error) {
        await handleInteractionError(interaction, error);
    }
}

// Helper functions
function isOnCooldown(userId: string, now: number): boolean {
    return cooldownMap.has(userId) && now < cooldownMap.get(userId)!;
}

function getCooldownRemaining(userId: string, now: number): number {
    return Math.round((cooldownMap.get(userId)! - now) / 1000);
}

async function handleCooldownResponse(interaction: any, timeLeft: number) {
    await interaction.reply({
        content: `Please wait ${timeLeft} more second(s) before using this command again.`,
        flags: [MessageFlags.Ephemeral]
    });
}

function extractInteractionOptions(interaction: any) {
    return {
        matchId: interaction.options.getString("matchid").toUpperCase(),
        newTimeStr: interaction.options.getString("newtime"),
        newMonthStr: interaction.options.getString("newmonth"),
        newDayStr: interaction.options.getString("newday")
    };
}

function validateDateRange(dateObj: Date, startDate: string, endDate: string, displayStart: string, displayEnd: string) {
    const currentYear = new Date().getFullYear();

    const startDateObj = new Date(currentYear,5, 2, 0, 0, 0);
    const endDateObj = new Date(currentYear, 5 , 15, 23, 59, 59);

    if (dateObj < startDateObj || dateObj > endDateObj) {
        throw new Error(`You can only reschedule matches to dates between **${displayStart}** and **${displayEnd}**.`);
    }
}

async function loadSheets() {
    const doc = await getDoc(bracketMatchSheetId);
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_TITLE];
    const playerSheet = doc.sheetsByTitle[CONFIG.PLAYER_SHEET];

    if (!sheet) throw new Error(`Sheet '${CONFIG.SHEET_TITLE}' not found.`);
    if (!playerSheet) throw new Error(`Sheet '${CONFIG.PLAYER_SHEET}' not found.`);

    await Promise.all([
        sheet.loadCells(`B${CONFIG.SHEET_START_ROW}:K${CONFIG.SHEET_END_ROW}`),
        playerSheet.loadCells(`A1:F150`)
    ]);

    return [doc, playerSheet, sheet];
}

function formatRescheduleMessage(matchId: string, opponentId: string, userId: string, timestamp: string): string {
    return `Hey <@${opponentId}>! <@${userId}> wants to reschedule **${matchId}** to ${timestamp}`;
}

function createActionRow() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("accept")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("reject")
                .setLabel("Reject")
                .setStyle(ButtonStyle.Danger)
        );
}

async function handleRescheduleResponse(
    message: any,
    opponentId: string,
    match: any,
    newTimeStr: string,
    newDateStr: string,
    discordTs: string,
    sheet: any,
    playerSheet: any
) {
    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000
    });

    collector.on("collect", async (i: any) => {
        try {
            if (i.user.id !== opponentId) {
                await i.reply({
                    content: "You are not authorized to respond to this request.",
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            await i.deferUpdate();

            if (i.customId === "reject") {
                await updateMessage(message, `~~${message.content}~~\n:cross mark: <@${opponentId}> rejected!`);
                collector.stop("rejected");
                return;
            }

            if (i.customId === "accept") {
                await updateMatchSchedule(
                    sheet,
                    match.row,
                    newTimeStr,
                    newDateStr
                );

                await updateMessage(
                    message,
                    `~~${message.content}~~\n:check mark: <@${opponentId}> accepted!`
                );

                await logReschedule(
                    playerSheet,
                    sheet,
                    message.client,
                    match.id,
                    discordTs
                );

                collector.stop("accepted");
            }
        } catch (error) {
            console.error("Error in collector:", error);
            await i.followUp({
                content: "An error occurred while processing your response.",
                flags: [MessageFlags.Ephemeral]
            });
        }
    });

    collector.on("end", async (_: any, reason: string) => {
        if (reason === "time") {
            const disabledRow = createDisabledActionRow();
            await updateMessage(
                message,
                `~~${message.content}~~\n:hourglass flowing: Reschedule request timed out`,
                [disabledRow]
            );
        }
    });
}

async function updateMessage(message: any, content: string, components: any[] = []) {
    try {
        await message.edit({ content, components });
    } catch (error) {
        console.error("Failed to update message:", error);
    }
}

async function updateMatchSchedule(
    sheet: any,
    row: number,
    newTimeStr: string,
    newDateStr: string
) {
    sheet.getCellByA1(`E${row}`).value = convertFraction(Number(newTimeStr));
    sheet.getCellByA1(`D${row}`).value = convertDateFormat(newDateStr);
    await sheet.saveUpdatedCells();
}

function createDisabledActionRow() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("accept")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId("reject")
                .setLabel("Reject")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );
}

async function logReschedule(
    playerSheet: any,
    sheet: any,
    client: any,
    matchId: string,
    discordTs: string
) {
    try {
        const logChannel = await client.channels.fetch(logChannelId);
        if (!logChannel || !logChannel.send) return;

        const staffNames = getStaffNames(sheet, matchId);
        const pings = [];

        if (staffNames?.referee) {
            const refereeId = getStaffidFromUsername(playerSheet, staffNames.referee);
            if (refereeId) pings.push(`<@${refereeId}>`);
        }

        if (staffNames?.streamer) {
            const streamerId = getStaffidFromUsername(playerSheet, staffNames.streamer);
            if (streamerId) pings.push(`<@${streamerId}>`);
        }

        const embed = new EmbedBuilder()
            .setDescription(`Match **${matchId}** has been rescheduled to ${discordTs}`);

        await logChannel.send({
            content: pings.length > 0 ? pings.join(" ") : undefined,
            embeds: [embed]
        });
    } catch (error) {
        console.error("Error logging reschedule:", error);
    }
}

async function handleInteractionError(interaction: any, error: unknown) {
    console.error("Error in reschedule command:", error);

    const errorMessage = error instanceof Error
        ? `Error: ${error.message}`
        : "An unexpected error occurred.";

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage });
    } else {
        await interaction.reply({
            content: errorMessage,
            flags: [MessageFlags.Ephemeral]
        });
    }
}

module.exports = { data, execute };