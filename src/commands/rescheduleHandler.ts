const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");

function convertFraction(time: any): any { return (time / 100) / 24; };

function convertDateFormat(d: string): string {
    const parts = d.split("-");
    if (parts.length !== 2) throw new Error("Invalid date format");

    const [monthStr, dayStr] = parts;
    const month = Number(monthStr);
    const day = Number(dayStr);

    const year = new Date().getFullYear();

    return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
};

function convertDate(d: string, t?: string): Date | null {
    const [mStr, dStr] = (d || "").split("-");
    const month = Number(mStr);
    const day = Number(dStr);
    if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const year = new Date().getFullYear();
    let hours = 0, minutes = 0;
    if (t) {
        hours = Math.floor(Number(t) / 100);
        minutes = Number(t) % 100;
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    }
    const date = new Date(year, month - 1, day, hours, minutes);
    return (date.getTime()) ? date : null;
};

function toDiscordTimestamp(date: Date, style: "t" | "T" | "d" | "D" | "f" | "F" | "R" = "f"): string {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:${style}>`;
};

function buildActionRow() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger)
        );
}
function getMatchRow(sheet: any, userId: string, matchId: string): any {
    for (let row = 10; row <= 28; row++) {
        const id = sheet.getCellByA1(`D${row}`).value;
        const time = sheet.getCellByA1(`E${row}`).value;
        const date = sheet.getCellByA1(`F${row}`).value;
        const player1 = sheet.getCellByA1(`O${row}`).value;
        const player2 = sheet.getCellByA1(`P${row}`).value;

        const isParticipant = player1 === userId || player2 === userId;
        const isMatch = matchId === id;

        if (isParticipant && isMatch && time && date && typeof time === "number" && typeof date === "number") {
            return { row, id, time, date, player1, player2 };
        }
    }
    return null;
};

function getOpponentDiscord(userId: string, player1: any, player2: any): string {
    return userId === player1 ? String(player2) : String(player1);
};

async function updateScheduleRow(sheet: any, row: number, newTime: string, newDate: string) {
    const timeCell = sheet.getCellByA1(`E${row}`);
    const dateCell = sheet.getCellByA1(`F${row}`);
    timeCell.value = convertFraction(newTime);
    dateCell.value = convertDateFormat(newDate);
    await sheet.saveUpdatedCells();
};

export const data = new SlashCommandBuilder()
    .setName("reschedule")
    .setDescription("Reschedule a match")
    .addStringOption((id: any) =>
        id.setName("matchid").setDescription("Match ID from the schedule sheet tab").setRequired(true)
    )
    .addStringOption((time: any) =>
        time.setName("newtime").setDescription("Time 24h format (e.g. 1900 for 07:00PM)").setRequired(true)
    )
    .addStringOption((date: any) =>
        date.setName("newdate").setDescription("Date MM-DD (e.g. 08-15)").setRequired(true)
    );

export async function execute(interaction: any) {
    const matchId = interaction.options.getString("matchid");
    const newTime = interaction.options.getString("newtime");
    const newDate = interaction.options.getString("newdate");

    const dateObj = convertDate(newDate, newTime);
    if (!dateObj) {
        await interaction.reply({ content: "Invalid date/time.", flags: 1 << 6 });
        return;
    }
    const discordTs = toDiscordTimestamp(dateObj, "f");
    const doc = getDoc();
    await doc.updateProperties({ timeZone: "GMT+08:00" });
    const sheet = doc.sheetsByTitle["Schedule"];
    if (!sheet) {
        await interaction.reply({ content: "Sheet 'Schedule' not found.", flags: 1 << 6 });
        return;
    }
    await sheet.loadCells("D6:P28");

    const match = getMatchRow(sheet, interaction.user.id, matchId);
    if (!match) {
        await interaction.reply({ content: `Match ID ${matchId} not found or not yours.`, flags: 1 << 6 });
        return;
    }

    const opponent = getOpponentDiscord(interaction.user.id, match.player1, match.player2);
    const messageText = `Hey <@${opponent}>! <@${interaction.user.id}> wants to reschedule **${matchId}** to ${discordTs}`;

    const row = buildActionRow();
    const sentMessage = await interaction.reply({ content: messageText, components: [row], fetchReply: true });

    const filter = (i: any) => i.isButton() && i.message.id === sentMessage.id;
    const collector = sentMessage.createMessageComponentCollector({ filter, time: 300000 });

    collector.on("collect", async (opponent: any) => {
        if (opponent.user.id !== opponent) {
            await opponent.reply({ content: `Only <@${opponent}> can respond.`, flags: 1 << 6 });
            return;
        }
        if (opponent.customId === "accept") {
            try {
                await updateScheduleRow(sheet, match.row, newTime, newDate);
                await opponent.update({ content: `~~${messageText}~~\n✅ <@${opponent.user.id}> accepted!`, components: [] });
                collector.stop();
            } catch (err) {
                console.error(err);
                await opponent.reply({ content: "Update failed.", flags: 1 << 6 });
            }
        } else if (opponent.customId === "reject") {
            await opponent.update({ content: `~~${messageText}~~\n❌ <@${opponent.user.id}> rejected!`, components: [] });
            collector.stop();
        }
    });

    collector.on("end", async () => {
        await sentMessage.edit({
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger).setDisabled(true)
                )
            ]
        });
    });
}

module.exports = { data, execute };