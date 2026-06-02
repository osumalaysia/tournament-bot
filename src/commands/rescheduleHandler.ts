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
    COOLDOWN_SECONDS: 0,
};
const bracketMatchSheetId = "1G1TN3dSdprXAkkttmQAce2o-SRCFil_PeGo9iPVGTy4";
const cooldownMap = new Map();
const logChannelId = "1499060711072989184";

const convertFraction = (time: any) => {
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return (hours + minutes / 60) / 24;
};

const convertDateFormat = (dateStr: any) => {
    const parts = dateStr.split("-");
    if (!parts[0] || !parts[1]) throw new Error("Invalid date format");

    const year = new Date().getFullYear();
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);

    const newDate = new Date(year, month - 1, day);
    const timezoneOffset = newDate.getTimezoneOffset() * 60 * 1000;

    return ((newDate.getTime() - timezoneOffset) / (1000 * 60 * 60 * 24)) + 25569;
};

const convertDate = (dateMatch: any, timeMatch: any) => {
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

const toDiscordTimestamp = (date: any) => {
    const unix = Math.floor(date.getTime() / 1000) - 8 * 60 * 60;
    return `<t:${unix}:f>`;
};


const getUsernameFromDiscordId = (PLAYER_SHEET: any, discordId: any) => {
    if (!PLAYER_SHEET || !discordId) return null;
    const targetId = String(discordId).trim();
    for (let i = 0; i < 200; i++) {
        try {
            const discordIdCell = PLAYER_SHEET.getCell(i, 5);

            if (discordIdCell && discordIdCell.value !== null && discordIdCell.value !== undefined) {
                const sheetValue = String(discordIdCell.value).trim();

                if (sheetValue === targetId) {
                    const usernameCell = PLAYER_SHEET.getCell(i, 0);
                    return usernameCell && usernameCell.value ? String(usernameCell.value).trim() : null;
                }
            }
        } catch (e) {
            continue;
        }
    }
    return null;
};

const getDiscordIdFromUsername = (PLAYER_SHEET: any, username: any) => {
    if (!PLAYER_SHEET || !username) return null;
    const targetUser = String(username).trim().toLowerCase();

    for (let i = 0; i < 200; i++) {
        try {
            const usernameCell = PLAYER_SHEET.getCell(i, 0);
            if (usernameCell && usernameCell.value) {
                const sheetUser = String(usernameCell.value).trim().toLowerCase();

                if (sheetUser === targetUser) {
                    const discordIdCell = PLAYER_SHEET.getCell(i, 5);
                    return discordIdCell && discordIdCell.value ? String(discordIdCell.value).trim() : null;
                }
            }
        } catch (e) {
            continue;
        }
    }
    return null;
};

const getStaffidFromUsername = (staffRows: any, username: any) => {
    for (const row of staffRows) {
        const rowData = row.toObject();
        if (String(rowData["Username"] || "").trim() === username.trim()) {
            return String(rowData["StaffID"] || "").trim() || null;
        }
    }
    return null;
};

const getMatchRow = (sheet: any, username: any, matchId: any) => {
    if (!sheet || !username || !matchId) return null;
    const targetUser = String(username).trim().toLowerCase();
    const targetMatchId = String(matchId).trim().toUpperCase();
    const COL_MATCH_ID = 1;
    const COL_PLAYER1 = 5;
    const COL_PLAYER2 = 8;
    const COL_REFEREE = 9;
    const COL_STREAMER = 10;
    const COL_DATE = 3;
    const COL_TIME = 4;

    for (let i = CONFIG.SHEET_START_ROW - 1; i < CONFIG.SHEET_END_ROW; i++) {
        try {
            const matchIdCell = sheet.getCell(i, COL_MATCH_ID);
            if (targetMatchId !== matchIdCell.value) continue;

            console.log(`Checking row ${i + 1}: found match ID "${matchIdCell.value}" and type "${typeof (matchIdCell.value)} vs target "${targetMatchId}" and type "${typeof (targetMatchId)} which is ${matchIdCell.value === targetMatchId ? "a match" : "not a match"}`);
            console.log(typeof (matchId));

            const currentMatchId = String(matchIdCell.value).trim().toUpperCase();

            if (currentMatchId === targetMatchId) {
                const p1Cell = sheet.getCell(i, COL_PLAYER1);
                const p2Cell = sheet.getCell(i, COL_PLAYER2);

                const player1 = p1Cell && p1Cell.value ? String(p1Cell.value).trim() : "";
                const player2 = p2Cell && p2Cell.value ? String(p2Cell.value).trim() : "";
                console.log(`=== PARTICIPANT DIAGNOSTIC FOR ROW ${i + 1} ===`);
                console.log(`Sheet Player 1: "${player1.toLowerCase()}"`);
                console.log(`Sheet Player 2: "${player2.toLowerCase()}"`);
                console.log(`Your Registered Username: "${targetUser}"`);
                console.log(`=============================================`);
                console.log(`Checking if user is a participant: ${player1.toLowerCase() === targetUser} || ${player2.toLowerCase() === targetUser}`);
                const isParticipant = player1.toLowerCase() === targetUser || player2.toLowerCase() === targetUser;

                if (isParticipant) {
                    const refCell = sheet.getCell(i, COL_REFEREE);
                    const streamCell = sheet.getCell(i, COL_STREAMER);
                    const dateCell = sheet.getCell(i, COL_DATE);
                    const timeCell = sheet.getCell(i, COL_TIME);

                    console.log(`Referee: "${refCell && refCell.value ? String(refCell.value).trim() : "N/A"}"`);
                    console.log(`Streamer: "${streamCell && streamCell.value ? String(streamCell.value).trim() : "N/A"}"`);
                    console.log(`Date Cell Value: "${dateCell && dateCell.value !== undefined && dateCell.value !== null ? String(dateCell.value).trim() : "N/A"}"`);
                    console.log(`Time Cell Value: "${timeCell && timeCell.value !== undefined && timeCell.value !== null ? String(timeCell.value).trim() : "N/A"}"`);
                    return {
                        rowIndex: i,
                        id: currentMatchId,
                        player1,
                        player2,
                        referee: refCell && refCell.value ? String(refCell.value).trim() : null,
                        streamer: streamCell && streamCell.value ? String(streamCell.value).trim() : null,
                        hasDate: dateCell && dateCell.value !== undefined && dateCell.value !== null && dateCell.value !== "",
                        hasTime: timeCell && timeCell.value !== undefined && timeCell.value !== null && timeCell.value !== "",
                    };
                }
            }
        } catch (e) {
            continue;
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
    const userId = interaction.user.id;
    const now = Date.now();

    if (cooldownMap.has(userId) && now < cooldownMap.get(userId)) {
        const timeLeft = Math.round((cooldownMap.get(userId) - now) / 1000);
        return interaction.reply({
            content: `Please wait ${timeLeft} more second(s) before using this command again.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    try {
        await interaction.deferReply();
        cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);

        const matchId = interaction.options.getString("matchid", true).toUpperCase().trim();
        const newTimeStr = interaction.options.getString("newtime", true).trim();
        const newMonthStr = interaction.options.getString("newmonth", true).trim();
        const newDayStr = interaction.options.getString("newday", true).trim();
        const newDateStr = `${newMonthStr}-${newDayStr}`;

        if (!/^\d{4}$/.test(newTimeStr)) {
            throw new Error("Time must be in 24h format (e.g., 1900)");
        }

        if (!/^\d{1,2}$/.test(newDayStr)) {
            throw new Error("Day must be a number (e.g., 15)");
        }

        const dateObj = convertDate(newDateStr, Number(newTimeStr));
        if (!dateObj) {
            throw new Error("Invalid date/time format.");
        }

        const currentYear = new Date().getFullYear();
        const allowedStart = new Date(currentYear, 5, 2, 0, 0, 0);
        const allowedEnd = new Date(currentYear, 5, 15, 23, 59, 59);

        if (dateObj < allowedStart || dateObj > allowedEnd) {
            throw new Error("You can only reschedule matches to dates between **June 2** and **June 15**.");
        }

        const doc = await getDoc(bracketMatchSheetId);
        if (!doc) {
            throw new Error("Failed to load Google Sheets document.");
        }

        const sheet = doc.sheetsByTitle[CONFIG.SHEET_TITLE];
        const playerSheet = doc.sheetsByTitle[CONFIG.PLAYER_SHEET];
        const staffSheet = doc.sheetsByTitle[CONFIG.STAFF_SHEET];

        if (!sheet || !playerSheet || !staffSheet) {
            throw new Error("One or more required sheets not found.");
        }

        try {
            await playerSheet.loadCells("A1:F200");
            await staffSheet.loadCells("A1:B100");
            await sheet.loadCells(`A${CONFIG.SHEET_START_ROW}:K${CONFIG.SHEET_END_ROW}`);
        } catch (err) {
            console.error("Error loading sheet rows:", err);
            throw new Error("Failed to load sheet data.");
        }

        const username = getUsernameFromDiscordId(playerSheet, userId);
        if (!username) {
            throw new Error("Could not find your Discord ID in the registered player list.");
        }

        const match = getMatchRow(sheet, username, matchId);
        if (!match) {
            throw new Error(`Match ID **${matchId}** not found.`);
        }

        if (!match.hasTime || !match.hasDate) {
            throw new Error("This match doesn't have a scheduled time yet.");
        }

        const opponentUsername = username === match.player1 ? match.player2 : match.player1;
        if (!opponentUsername) {
            throw new Error("Could not determine opponent.");
        }

        const opponentId = getDiscordIdFromUsername(playerSheet, opponentUsername);
        if (!opponentId) {
            throw new Error("Could not find opponent Discord ID.");
        }

        const discordTs = toDiscordTimestamp(dateObj);
        const messageText = `Hey <@${opponentId}>! <@${userId}> wants to reschedule **${matchId}** to ${discordTs}`;

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("accept")
                .setLabel("Accept")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("reject")
                .setLabel("Reject")
                .setStyle(ButtonStyle.Danger)
        );

        const sentMessage = await interaction.editReply({
            content: messageText,
            components: [buttons]
        });

        const collector = sentMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 5 * 60 * 1000 // 5 minutes
        });

        let interactionEnded = false;

        const timeout = setTimeout(() => {
            if (!interactionEnded) {
                interactionEnded = true;
                collector.stop("timeout");
            }
        }, 5 * 60 * 1000);

        collector.on("collect", async (i: any) => {
            if (i.user.id !== opponentId) {
                await i.reply({
                    content: "You are not authorized to respond to this request.",
                    flags: [MessageFlags.Ephemeral]
                }).catch(console.error);
                return;
            }

            await i.deferUpdate();

            try {
                if (i.customId === "reject") {
                    await sentMessage.edit({
                        content: `~~${messageText}~~\n:cross mark: <@${opponentId}> rejected!`,
                        components: []
                    });
                    collector.stop("rejected");
                    return;
                }

                if (i.customId === "accept") {
                    const newTimeValue = convertFraction(Number(newTimeStr));
                    const newDateValue = convertDateFormat(newDateStr);

                    if (isNaN(newTimeValue) || isNaN(newDateValue)) {
                        throw new Error("Invalid time or date value calculated.");
                    }

                    const dateCellToUpdate = sheet.getCell(match.rowIndex, 3);
                    const timeCellToUpdate = sheet.getCell(match.rowIndex, 4);

                    dateCellToUpdate.value = newDateValue;
                    timeCellToUpdate.value = newTimeValue;

                    await sheet.saveUpdatedCells();
                    await sentMessage.edit({
                        content: `~~${messageText}~~\n:check mark: <@${opponentId}> accepted!`,
                        components: []
                    });

                    try {
                        const logChannel = await interaction.client.channels.fetch(logChannelId).catch(console.error);
                        if (logChannel && logChannel.send) {
                            const embed = new EmbedBuilder()
                                .setDescription(`Match **${matchId}** has been rescheduled to ${discordTs}`);

                            const pings = [];
                            if (match.referee) {
                                const refereeId = getStaffidFromUsername(staffSheet, match.referee);
                                if (refereeId && refereeId !== "unknown") pings.push(`<@${refereeId}>`);
                            }
                            if (match.streamer) {
                                const staffId = getStaffidFromUsername(staffSheet, match.streamer);
                                if (staffId && staffId !== "unknown") pings.push(`<@${staffId}>`);
                            }

                            await logChannel.send({
                                content: pings.length > 0 ? pings.join(' ') : undefined,
                                embeds: [embed]
                            }).catch(console.error);
                        }
                    } catch (logError) {
                        console.error("Error logging reschedule:", logError);
                    }

                    collector.stop("accepted");
                }
            } catch (error: any) {
                console.error("Error processing interaction:", error);
                await i.followUp({
                    content: `An error occurred: ${error.message}`,
                    flags: [MessageFlags.Ephemeral]
                }).catch(console.error);
            }
        });

        collector.on("end", async (collected: any, reason: string) => {
            clearTimeout(timeout);
            interactionEnded = true;

            try {
                if (reason === "timeout") {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(true),
                        new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger).setDisabled(true)
                    );
                    await sentMessage.edit({
                        content: `~~${messageText}~~\n:hourglass flowing: Reschedule request timed out`,
                        components: [disabledRow]
                    }).catch(console.error);
                }
            } catch (error) {
                console.error("Error in collector end handler:", error);
            }
        });

    } catch (error: any) {
        console.error("Error in reschedule command:", error);

        if (interaction.deferred) {
            await interaction.editReply({
                content: `Error: ${error.message || "An unknown error occurred."}`
            }).catch(console.error);
        } else {
            await interaction.reply({
                content: `Error: ${error.message || "An unknown error occurred."}`,
                flags: [MessageFlags.Ephemeral]
            }).catch(console.error);
        }
    } finally {
        if (cooldownMap.get(userId) <= Date.now()) {
            cooldownMap.delete(userId);
        }
    }
}

module.exports = { data, execute };