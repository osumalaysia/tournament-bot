const { SlashCommandBuilder } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { GoogleSpreadsheetWorksheet } = require("google-spreadsheet");
const { ChatInputCommandInteraction } = require("discord.js");
const MATCH_ID_COL = "B";
const SLOT_COLUMNS = [
    "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"
];
const SHEET_TITLE = "Schedule";
const tryout_roles = "1458174201033654412";
const channel = "1496102471527825569";
const qualifierSheetId = "1Xca3qCtnU_y-B7FTizkrC3XSMja6zDrsCYPeNSo8gNQ"
const logChannelId = "1499060711072989184";

const data = new SlashCommandBuilder()
    .setName("drop")
    .setDescription("drop yourself from a qualifier lobby")

function findExistingUser(sheet: typeof GoogleSpreadsheetWorksheet, username: string): { row: number; col: string } | null {
    for (let row = 1; row <= sheet.getLastRow(); row++) {
        for (const col of SLOT_COLUMNS) {
            const cellValue = sheet.getCellByA1(`${col}${row}`).value;
            if (cellValue && cellValue.toString() === username) {
                return { row, col };
            }
        }
    }
    return null;
}

function findMatchIDRow(sheet: typeof GoogleSpreadsheetWorksheet, matchId: string): number {
    for (let row = 1; row <= sheet.getLastRow(); row++) {
        const idVal = sheet.getCellByA1(`${MATCH_ID_COL}${row}`).value;
        if (idVal && idVal.toString() === matchId) return row;
    }
    return -1;
}


export async function execute(interaction: typeof ChatInputCommandInteraction): Promise<void> {
    const memberRoles = interaction.member?.roles;

    if (!interaction.inGuild() || (memberRoles && !Array.isArray(memberRoles) && !memberRoles.cache?.has(tryout_roles))) {
        await interaction.reply({
            content: "You do not have the required role to sign up for qualifiers.",
            ephemeral: true
        });
        return;
    }
    if (interaction.channelId !== channel) {
        await interaction.reply({
            content: "wrong channel blud",
            ephemeral: true
        });
        return;
    }

    try {
        const doc = await getDoc(qualifierSheetId);

        const playerSheet = doc.sheetsByTitle["PlayerList"];
        if (!playerSheet) {
            await interaction.reply({ content: "Error: Sheet 'PlayerList' could not be found.", ephemeral: true });
            return;
        }

        const rowCount = playerSheet.rowCount || 1000;
        await playerSheet.loadCells(`A1:C${rowCount}`);

        let username: string | null = null;
        let matchId: string  = "";
        for (let r = 1; r <= rowCount; r++) {
            const discordIdCell = playerSheet.getCellByA1(`C${r}`).value;
            if (discordIdCell && discordIdCell.toString().trim() === interaction.user.id) {
                username = playerSheet.getCellByA1(`A${r}`).value?.toString() || null;
                matchId = playerSheet.getCellByA1(`D${r}`).value?.toString() || null;
                break;
            }
        }

        if (!username) {
            await interaction.reply({ content: "Error: Could not find your Discord ID in the registered player list.", ephemeral: true });
            return;
        }

        const sheet = doc.sheetsByTitle[SHEET_TITLE];
        if (!sheet) {
            await interaction.reply({ content: `Error: Sheet '${SHEET_TITLE}' could not be found.`, ephemeral: true });
            return;
        }

        

        const endCol = SLOT_COLUMNS[SLOT_COLUMNS.length - 1];
        await sheet.loadCells(`A${1}:${endCol}${sheet.getLastRow()}`);

        const matchRow = findMatchIDRow(sheet, matchId);
        if (matchRow === -1) {
            await interaction.reply({ content: `Could not find Qualifier ID: **${matchId}**`, ephemeral: true });
            return;
        }

        const existingUser = findExistingUser(sheet, username);

        if (existingUser) {
            sheet.getCellByA1(`${existingUser.col}${existingUser.row}`).value = "";
        }   else {
            await interaction.reply({ content: `You are not signed up for qualifier **${matchId}**.`, ephemeral: true });
            return;
        }

        await sheet.saveUpdatedCells();
        await interaction.reply({ content: `Successfully removed **${username}** from qualifier **${matchId}**.`, ephemeral: true });
        const logChannel = await interaction.client.channels.fetch(logChannelId);
        if (logChannel && 'send' in logChannel) {
            await logChannel.send(`**${username}** has dropped from qualifier **${matchId}**.`);
        }
    } catch (error) {
        console.error("Error updating qualifier sheet:", error);
        await interaction.reply({ content: "An error occurred while trying to update the schedule. Please try again later.", ephemeral: true });
    }
}

module.exports = { data, execute };