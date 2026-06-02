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

const convertFraction = (time:any) => {
    const hours = Math.floor(time / 100);
    const minutes = time % 100;
    return (hours + minutes / 60) / 24;
};

const convertDateFormat = (dateStr:any) => {
    const parts = dateStr.split("-");
    if (!parts[0] || !parts[1]) throw new Error("Invalid date format");

    const year = new Date().getFullYear();
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);

    const newDate = new Date(year, month - 1, day);
    const timezoneOffset = newDate.getTimezoneOffset() * 60 * 1000;

    return ((newDate.getTime() - timezoneOffset) / (1000 * 60 * 60 * 24)) + 25569;
};

const convertDate = (dateMatch:any, timeMatch:any) => {
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

const toDiscordTimestamp = (date:any) => {
    const unix = Math.floor(date.getTime() / 1000) - 8 * 60 * 60;
    return `<t:${unix}:f>`;
};


const getUsernameFromDiscordId = (playerRows:any, discordId:any) => {
    for (const row of playerRows) {
        const rowData = row.toObject();
        if (String(rowData["DiscordID"] || "").trim() === discordId.trim()) {
            return String(rowData["Username"] || "").trim() || null;
        }
    }
    return null;
};

const getDiscordIdFromUsername = (playerRows:any, username:any) => {
    for (const row of playerRows) {
        const rowData = row.toObject();
        if (String(rowData["Username"] || "").trim() === username.trim()) {
            return String(rowData["DiscordID"] || "").trim() || null;
        }
    }
    return null;
};

const getStaffidFromUsername = (staffRows:any, username:any) => {
    for (const row of staffRows) {
        const rowData = row.toObject();
        if (String(rowData["Username"] || "").trim() === username.trim()) {
            return String(rowData["StaffID"] || "").trim() || null;
        }
    }
    return null;
};

const getMatchRow = (scheduleRows:any, username:any, matchId:any) => {
    for (let i = 0; i < scheduleRows.length; i++) {
        const row = scheduleRows[i];
        const rowData = row.toObject();
        const id = String(rowData["MatchID"] || "").toUpperCase();
        const player1 = String(rowData["Player1"] || "");
        const player2 = String(rowData["Player2"] || "");

        const isParticipant = player1 === username || player2 === username;

        if (isParticipant && id === matchId) {
            return {
                rowInstance: row,
                id,
                player1,
                player2,
                referee: rowData["Referee"] ? String(rowData["Referee"]) : null,
                streamer: rowData["Streamer"] ? String(rowData["Streamer"]) : null,
                hasDate: rowData["Date"] !== undefined && rowData["Date"] !== null && rowData["Date"] !== "",
                hasTime: rowData["Time"] !== undefined && rowData["Time"] !== null && rowData["Time"] !== "",
            };
        }
    }
    return null;
};

export const data = new SlashCommandBuilder()
    .setName("reschedule")
    .setDescription("Reschedule a match")
    .addStringOption((opt:any) =>
        opt.setName("matchid")
            .setDescription("Match ID from the schedule sheet")
            .setRequired(true)
    )
    .addStringOption((opt:any) =>
        opt.setName("newtime")
            .setDescription("Time 24h format (e.g. 1900)")
            .setRequired(true)
    )
    .addStringOption((opt:any) =>
        opt.setName("newmonth")
            .setDescription("Month (e.g. 08)")
            .setRequired(true)
            .addChoices([
                { name: "Jun", value: "06" },
                { name: "Jul", value: "07" },
                { name: "Aug", value: "08" }
            ])
    )
    .addStringOption((opt:any) =>
        opt.setName("newday")
            .setDescription("Day (e.g. 15)")
            .setRequired(true)
    );

export async function execute(interaction:any) {
    const userId = interaction.user.id;
    const now = Date.now();

    if (cooldownMap.has(userId)) {
        const expirationTime = cooldownMap.get(userId);
        if (now < expirationTime) {
            const timeLeft = Math.round((expirationTime - now) / 1000);
            await interaction.reply({ 
                content: `Please wait ${timeLeft} more second(s) before using this command again.`, 
                flags: [MessageFlags.Ephemeral] 
            });
            return;
        }
    }

    await interaction.deferReply();
    cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);

    const matchId = interaction.options.getString("matchid", true).toUpperCase();
    const newTimeStr = interaction.options.getString("newtime", true);
    const newMonthStr = interaction.options.getString("newmonth", true);
    const newDayStr = interaction.options.getString("newday", true);
    const newDateStr = `${newMonthStr}-${newDayStr}`;
    const dateObj = convertDate(newDateStr, Number(newTimeStr));

    if (!dateObj) return interaction.editReply({ content: "Invalid date/time format." });
    const currentYear = new Date().getFullYear();
    const allowedStart = new Date(currentYear, 5, 2, 0, 0, 0); 
    const allowedEnd = new Date(currentYear, 5, 15, 23, 59, 59);
    if (dateObj < allowedStart || dateObj > allowedEnd) {
        return interaction.editReply({ 
            content: "You can only reschedule matches to dates between **June 2** and **June 15**." 
        });
    }

    const doc = await getDoc(bracketMatchSheetId);
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_TITLE];
    const playerSheet = doc.sheetsByTitle[CONFIG.PLAYER_SHEET];
    const staffSheet = doc.sheetsByTitle[CONFIG.STAFF_SHEET];

    if (!sheet) return interaction.editReply({ content: `Sheet '${CONFIG.SHEET_TITLE}' not found.` });
    if (!playerSheet) return interaction.editReply({ content: `Sheet '${CONFIG.PLAYER_SHEET}' not found.` });
    if (!staffSheet) return interaction.editReply({ content: `Sheet '${CONFIG.STAFF_SHEET}' not found.` });

    const [scheduleRows, playerRows, staffRows] = await Promise.all([
        sheet.getRows({ 
            offset: CONFIG.SHEET_START_ROW - 2
        }),
        playerSheet.getRows(),
        staffSheet.getRows()
    ]);

    const username = getUsernameFromDiscordId(playerRows, interaction.user.id);
    if (!username) {
        return interaction.editReply({ content: "Error: Could not find your Discord ID in the registered player list." });
    }

    const match = getMatchRow(scheduleRows, username, matchId);
    if (!match || !match.hasTime || !match.hasDate) {
        return interaction.editReply({ content: `Match ID **${matchId}** not found, or you are not a player in it.` });
    }

    const opponentUsername = username === match.player1 ? match.player2 : match.player1;
    const opponentId = opponentUsername ? getDiscordIdFromUsername(playerRows, opponentUsername) : null;

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

    collector.on("collect", async (i:any) => {
        if (i.user.id !== opponentId) {
            await i.reply({ 
                content: "You are not authorized to respond to this request.", 
                flags: [MessageFlags.Ephemeral] 
            });
            return;
        }

        await i.deferUpdate();

        if (i.customId === "reject") {
            await sentMessage.edit({ content: `~~${messageText}~~\n❌ <@${opponentId}> rejected!`, components: [] });
            return collector.stop("rejected");
        }

        if (i.customId === "accept") {
            try {
                const rowToUpdate = match.rowInstance;
                rowToUpdate.set('Time', convertFraction(Number(newTimeStr)));
                rowToUpdate.set('Date', convertDateFormat(newDateStr));
                await rowToUpdate.save(); 

                await sentMessage.edit({ content: `~~${messageText}~~\n✅ <@${opponentId}> accepted!`, components: [] });
                
                const logChannel = await interaction.client.channels.fetch(logChannelId);
                const embed = new EmbedBuilder()
                    .setDescription(`Match **${matchId}** has been rescheduled to ${discordTs}`);
                
                if (logChannel && 'send' in logChannel) {
                    const refereeid = getStaffidFromUsername(staffRows, match.referee || "") || "unknown";
                    const staffid = getStaffidFromUsername(staffRows, match.streamer || "") || "unknown";
                    
                    const pings = [];
                    if (refereeid && refereeid !== "unknown") pings.push(`<@${refereeid}>`);
                    if (staffid && staffid !== "unknown") pings.push(`<@${staffid}>`);
                    const contentString = pings.length > 0 ? pings.join(" ") : undefined;
                    
                    await logChannel.send({
                        content: contentString,
                        embeds: [embed]
                    });
                }
                return collector.stop("accepted");
            } catch (err) {
                console.error(err);
                await i.followUp({ 
                    content: "Failed to update sheet.", 
                    flags: [MessageFlags.Ephemeral] 
                });
            }
        }
    });

    collector.on("end", async (_:any, reason:string) => {
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