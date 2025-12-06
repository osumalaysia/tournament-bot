const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { referee, streamer, commentator } = require("../../staff.cfg");

const SHEET_START_ROW = 10;
const SHEET_END_ROW = 28;
const SHEET_NAME = "Schedule";
const TIMEZONE_OFFSET_GMT8 = "GMT+08:00";

const getStaffName = (role: string, userId: string) => {
    const arr = { referee, streamer, commentator }[role];
    if (!Array.isArray(arr)) return userId;
    const found = arr.find((item: [string,string]) => String(item[0]) === String(userId));
    return found ? found[1] : userId;
};

const assignStaff = (sheet: any, role: string, matchId: string) => {

    const roleColumnMap: { [key: string]: string } = {
        referee: "Q",
        streamer: "R",
        commentator: "S"
    };

    for (let row = SHEET_START_ROW; row <= SHEET_END_ROW; row++) {
        const id = sheet.getCellByA1(`D${row}`).value;
        if (id === matchId) {
            const col = roleColumnMap[role];
            if (!col) return null;
            return { row, col };
        }
    }
    return null;
};

export const data = new SlashCommandBuilder()
    .setName("staffadd")
    .setDescription("Add staff to a match")
    .addStringOption((opt: any) =>
        opt.setName("role")
            .setDescription("Choose your role")
            .setRequired(true)
            .addChoices(
                { name: "Referee", value: "referee" },
                { name: "Streamer", value: "streamer" },
                { name: "Commentator", value: "commentator" }
            )
    )
    .addStringOption((opt: any) =>
        opt.setName("matchid")
            .setDescription("Match ID from the schedule sheet")
            .setRequired(true)
    );

export async function execute(interaction: any) {
    const role = interaction.options.getString("role");
    const matchId = interaction.options.getString("matchid");
    const doc = getDoc();
    await doc.updateProperties({ timeZone: TIMEZONE_OFFSET_GMT8 });

    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) return interaction.reply({ content: `Sheet '${SHEET_NAME}' not found.`, ephemeral: true });

    await sheet.loadCells(`D${SHEET_START_ROW}:S${SHEET_END_ROW}`);

    const staffInfo = assignStaff(sheet, role, matchId);
    if (!staffInfo) return interaction.reply({ content: "Invalid role or match ID.", ephemeral: true });

    const staffName = getStaffName(role, interaction.user.id);
    if (staffName === interaction.user.id) {
        return interaction.reply({ content: `No staff name found for your role "${role}".`, ephemeral: true });
    }

    const staffCell = sheet.getCellByA1(`${staffInfo.col}${staffInfo.row}`);
    
    staffCell.value = staffName;
    await sheet.saveUpdatedCells();

    await interaction.reply({ content: `Added <@${interaction.user.id}> as ${role} for match ${matchId}` });

}

module.exports = { data, execute };