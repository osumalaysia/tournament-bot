const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");

const SHEET_START_ROW = 10;
const SHEET_END_ROW = 28;
const SHEET_NAME = "Schedule";
const TIMEZONE_OFFSET_GMT8 = "GMT+08:00";

const convertFraction = (time: number): number => (time / 100) / 24;

const convertDateFormat = (dateStr: string): number => {
    const parts = dateStr.split("-");
    if (!parts[0] || !parts[1]) throw new Error("Invalid date format");

    const year = new Date().getFullYear();
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);

    const newDate = new Date(year, month - 1, day);
    const timezoneOffset = newDate.getTimezoneOffset() * 60000;
    
    return ((newDate.getTime() - timezoneOffset) / 86400000) + 25569;
};

const convertDate = (dateStr: string, timeStr?: string): Date | null => {
    const [mStr, dStr] = (dateStr || "").split("-");
    const month = Number(mStr);
    const day = Number(dStr);

    if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const year = new Date().getFullYear();
    let hours = 0, minutes = 0;

    if (timeStr) {
        hours = Math.floor(Number(timeStr) / 100);
        minutes = Number(timeStr) % 100;
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    }

    const date = new Date(year, month - 1, day, hours, minutes);
    return !isNaN(date.getTime()) ? date : null;
};

const toDiscordTimestamp = (date: Date): string => {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:f>`;
};

const getMatchRow = (sheet: any, userId: string, matchId: string) => {
    for (let row = SHEET_START_ROW; row <= SHEET_END_ROW; row++) {

        const id = sheet.getCellByA1(`D${row}`).value;
        const player1 = sheet.getCellByA1(`O${row}`).value;
        const player2 = sheet.getCellByA1(`P${row}`).value;

        const isParticipant = player1 === userId || player2 === userId;
        
        if (isParticipant && id === matchId) {
            return { 
                row, 
                id, 
                player1, 
                player2,

                hasTime: typeof sheet.getCellByA1(`E${row}`).value === "number",
                hasDate: typeof sheet.getCellByA1(`F${row}`).value === "number"
            };
        }
    }
    return null;
};

export const data = new SlashCommandBuilder()
    .setName("reschedule")
    .setDescription("Reschedule a match")
    .addStringOption((opt: any) =>
        opt.setName("matchid").setDescription("Match ID from the schedule sheet").setRequired(true)
    )
    .addStringOption((opt: any) =>
        opt.setName("newtime").setDescription("Time 24h format (e.g. 1900)").setRequired(true)
    )
    .addStringOption((opt: any) =>
        opt.setName("newdate").setDescription("Date MM-DD (e.g. 08-15)").setRequired(true)
    );

export async function execute(interaction: any) {
    const matchId = interaction.options.getString("matchid");
    const newTimeStr = interaction.options.getString("newtime");
    const newDateStr = interaction.options.getString("newdate");

    const dateObj = convertDate(newDateStr, newTimeStr);
    if (!dateObj) return interaction.reply({ content: "Invalid date/time format.", ephemeral: true });

    const doc = getDoc();
    await doc.updateProperties({ timeZone: TIMEZONE_OFFSET_GMT8 });
    
    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) return interaction.reply({ content: `Sheet '${SHEET_NAME}' not found.`, ephemeral: true });
    
    await sheet.loadCells(`D$${SHEET_START_ROW}:P${SHEET_END_ROW}`);

    const match = getMatchRow(sheet, interaction.user.id, matchId);
    if (!match || !match.hasTime || !match.hasDate) {
        return interaction.reply({ content: `Match ID **${matchId}** not found, or you are not a player in it.`, ephemeral: true });
    }

    const opponentId = interaction.user.id === match.player1 ? String(match.player2) : String(match.player1);
    const discordTs = toDiscordTimestamp(dateObj);
    const messageText = `Hey <@${opponentId}>! <@${interaction.user.id}> wants to reschedule **${matchId}** to ${discordTs}`;

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await interaction.reply({ 
        content: messageText, 
        components: [buttons], 
        fetchReply: true 
    });

    const collector = sentMessage.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000 
    });

    collector.on("collect", async (i: any) => {
        
        if (i.customId === "reject") {
            await i.update({ content: `~~${messageText}~~\n❌ <@${opponentId}> rejected!`, components: [] });
            return collector.stop();
        }

        if (i.customId === "accept") {
            try {
                sheet.getCellByA1(`E${match.row}`).value = convertFraction(Number(newTimeStr));
                sheet.getCellByA1(`F${match.row}`).value = convertDateFormat(newDateStr);
                await sheet.saveUpdatedCells();

                await i.update({ content: `~~${messageText}~~\n✅ <@${opponentId}> accepted!`, components: [] });
                collector.stop();
            } catch (err) {
                console.error(err);
                await i.reply({ content: "Failed to update sheet.", ephemeral: true });
            }
        }
    });

    collector.on("end", async (_: any, reason: string) => {
        if (reason !== "user") {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger).setDisabled(true)
            );
            await sentMessage.edit({ components: [disabledRow] }).catch(() => {});
        }
    });
}

module.exports = { data, execute };