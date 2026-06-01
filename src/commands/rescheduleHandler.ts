const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require("discord.js");
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
                { name: "Jan", value: "01" },
                { name: "Feb", value: "02" },
                { name: "Mar", value: "03" },
                { name: "Apr", value: "04" },
                { name: "May", value: "05" },
                { name: "Jun", value: "06" },
                { name: "Jul", value: "07" },
                { name: "Aug", value: "08" },
                { name: "Sep", value: "09" },
                { name: "Oct", value: "10" },
                { name: "Nov", value: "11" },
                { name: "Dec", value: "12" }
            ])
    )
    .addStringOption((opt: any) =>
        opt.setName("newday")
            .setDescription("Day (e.g. 15)")
            .setRequired(true)
    );

export async function execute(interaction: typeof ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const now = Date.now();

    if (cooldownMap.has(userId)) {
        const expirationTime = cooldownMap.get(userId)!;
        if (now < expirationTime) {
            const timeLeft = Math.round((expirationTime - now) / 1000);
            await interaction.reply({ content: `Please wait ${timeLeft} more second(s) before using this command again.`, ephemeral: true });
            return;
        }
    }

    await interaction.deferReply();
    cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);

    const matchId = interaction.options.getString("matchid").toUpperCase();
    const newTimeStr = interaction.options.getString("newtime");
    const newMonthStr = interaction.options.getString("newmonth");
    const newDayStr = interaction.options.getString("newday");
    const newDateStr = `${newMonthStr}-${newDayStr}`;
    const dateObj = convertDate(newDateStr, newTimeStr);

    if (!dateObj) return interaction.editReply({ content: "Invalid date/time format." });

    const doc = await getDoc(bracketMatchSheetId);

    const sheet = doc.sheetsByTitle[CONFIG.SHEET_TITLE];
    const playerSheet = doc.sheetsByTitle[CONFIG.PLAYER_SHEET];
    if (!sheet) return interaction.editReply({ content: `Sheet '${CONFIG.SHEET_TITLE}' not found.` });
    if (!playerSheet) return interaction.editReply({ content: `Sheet '${CONFIG.PLAYER_SHEET}' not found.` });

    await Promise.all([
        sheet.loadCells(`B${CONFIG.SHEET_START_ROW}:K${CONFIG.SHEET_END_ROW}`),
        playerSheet.loadCells(`A1:F150`)
    ]);

    const username = getUsernameFromDiscordId(playerSheet, interaction.user.id);
    if (!username) {
        return interaction.editReply({ content: "Error: Could not find your Discord ID in the registered player list." });
    }

    const match = getMatchRow(sheet, username, matchId);
    if (!match || !match.hasTime || !match.hasDate) {
        return interaction.editReply({ content: `Match ID **${matchId}** not found, or you are not a player in it.` });
    }

    const opponentUsername = username === match.player1 ? match.player2 : match.player1;
    const opponentId = opponentUsername ? getDiscordIdFromUsername(playerSheet, opponentUsername) : null;

    if (!opponentId) {
        return interaction.editReply({ content: `Could not find opponent Discord ID.` });
    }

    const discordTs = toDiscordTimestamp(dateObj);
    const messageText = `Hey <@${opponentId}>! <@${interaction.user.id}> wants to reschedule **${matchId}** to ${discordTs}`;

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await interaction.editReply({
        content: messageText,
        components: [buttons]
    });

    const collector = sentMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000
    });

    collector.on("collect", async (i: any) => {
        if (i.user.id !== opponentId) {
            await i.reply({ content: "You are not authorized to respond to this request.", ephemeral: true });
            return;
        }

        await i.deferUpdate();

        if (i.customId === "reject") {
            await i.update({ content: `~~${messageText}~~\n❌ <@${opponentId}> rejected!`, components: [] });
            return collector.stop("rejected");
        }

        if (i.customId === "accept") {
            try {
                sheet.getCellByA1(`E${match.row}`).value = convertFraction(Number(newTimeStr));
                sheet.getCellByA1(`D${match.row}`).value = convertDateFormat(newDateStr);
                await sheet.saveUpdatedCells();

                await i.update({ content: `~~${messageText}~~\n✅ <@${opponentId}> accepted!`, components: [] });
                const logChannel = await interaction.client.channels.fetch(logChannelId);
                const embed = new EmbedBuilder()
                    .setDescription(`Match **${matchId}** has been rescheduled to ${discordTs}`);
                if (logChannel && 'send' in logChannel) {
                    const staffNames = getStaffNames(sheet, matchId);
                    const refereeid = getStaffidFromUsername(playerSheet, staffNames?.referee || "") || "unknown";
                    const staffid = getStaffidFromUsername(playerSheet, staffNames?.streamer || "") || "unknown";
                    const pings = [];
                    if (refereeid) pings.push(`@${refereeid}`);
                    if (staffid) pings.push(`@${staffid}`);
                    const contentString = pings.length > 0 ? pings.join(" ") : undefined;
                    await logChannel.send({
                        content: contentString,
                        embeds: [embed]
                    });
                }
                return collector.stop("accepted");
            } catch (err) {
                console.error(err);
                await i.reply({ content: "Failed to update sheet.", ephemeral: true });
            }
        }
    });

    collector.on("end", async (_: any, reason: string) => {
        if (reason !== "accepted" && reason !== "rejected") {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger).setDisabled(true)
            );
            await sentMessage.edit({ content: `~~${messageText}~~\n⏳ Reschedule request timed out`, components: [disabledRow] }).catch(() => { });
        }
    });
}

module.exports = { data, execute };