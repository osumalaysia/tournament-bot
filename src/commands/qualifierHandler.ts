const { SlashCommandBuilder } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { GoogleSpreadsheetWorksheet } = require("google-spreadsheet");
const { ChatInputCommandInteraction } = require("discord.js");
const tryout_roles = "1458174201033654412";
const channel = "1496102471527825569";
const MATCH_ID_COL = "B";
const SLOT_COLUMNS = [
  "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"
];
const START_ROW = 3;
const END_ROW = 30;
const SHEET_TITLE = "Schedule";

const data = new SlashCommandBuilder()
  .setName("qualifier")
  .setDescription("Sign up for a qualifier lobby")
  .addStringOption((id: any) =>
    id.setName("matchid").setDescription("Match ID from the sheet").setRequired(true)
  );

function findMatchRow(sheet: typeof GoogleSpreadsheetWorksheet, matchId: string): number {
  for (let row = START_ROW; row <= END_ROW; row++) {
    const idVal = sheet.getCellByA1(`${MATCH_ID_COL}${row}`).value;
    if (idVal && idVal.toString() === matchId) return row;
  }
  return -1;
}

function findExistingUser(sheet: typeof GoogleSpreadsheetWorksheet, username: string): { row: number; col: string } | null {
  for (let row = START_ROW; row <= END_ROW; row++) {
    for (const col of SLOT_COLUMNS) {
      const cellValue = sheet.getCellByA1(`${col}${row}`).value;
      if (cellValue && cellValue.toString() === username) {
        return { row, col };
      }
    }
  }
  return null;
}

function findFirstEmptySlot(sheet: typeof GoogleSpreadsheetWorksheet, matchRow: number): string | null {
  for (const col of SLOT_COLUMNS) {
    const cellValue = sheet.getCellByA1(`${col}${matchRow}`).value;
    if (!cellValue || cellValue.toString().trim() === "") {
      return col;
    }
  }
  return null;
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

  const matchId = interaction.options.getString("matchid")?.toUpperCase() ?? "";

  try {
    const doc = await getDoc();

    const playerSheet = doc.sheetsByTitle["PlayerList"];
    if (!playerSheet) {
      await interaction.reply({ content: "Error: Sheet 'PlayerList' could not be found.", ephemeral: true });
      return;
    }

    const rowCount = playerSheet.rowCount || 1000;
    await playerSheet.loadCells(`A1:C${rowCount}`);

    let username: string | null = null;
    for (let r = 1; r <= rowCount; r++) {
      const discordIdCell = playerSheet.getCellByA1(`C${r}`).value;
      if (discordIdCell && discordIdCell.toString().trim() === interaction.user.id) {
        username = playerSheet.getCellByA1(`A${r}`).value?.toString() || null;
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
    await sheet.loadCells(`A${START_ROW}:${endCol}${END_ROW}`);

    const matchRow = findMatchRow(sheet, matchId);
    if (matchRow === -1) {
      await interaction.reply({ content: `Could not find Qualifier ID: **${matchId}**`, ephemeral: true });
      return;
    }

    const existingUser = findExistingUser(sheet, username);

    if (existingUser) {
      if (existingUser.row === matchRow) {
        await interaction.reply({ content: `You cannot sign up for the same Qualifier Lobby: **${matchId}**.`, ephemeral: true });
        return;
      }
      sheet.getCellByA1(`${existingUser.col}${existingUser.row}`).value = "";
    }

    const targetCol = findFirstEmptySlot(sheet, matchRow);
    if (!targetCol) {
      await interaction.reply({ content: `Qualifier **${matchId}** is currently full.`, ephemeral: true });
      return;
    }

    sheet.getCellByA1(`${targetCol}${matchRow}`).value = username;
    await sheet.saveUpdatedCells();

    await interaction.reply({ content: `Successfully Assign **${username}** to qualifier **${matchId}** at (Slot ${targetCol}).`, ephemeral: false });

  } catch (error) {
    console.error("Error updating qualifier sheet:", error);
    await interaction.reply({ content: "An error occurred while trying to update the schedule. Please try again later.", ephemeral: true });
  }
}

module.exports = { data, execute };