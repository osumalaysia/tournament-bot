const { SlashCommandBuilder } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");

const MATCH_ID_COL = "A";                
const SLOT_COLUMNS = [
  "C","E","F","G","H","I","J","K","L","M","N","O","P","Q","R" 
];
const START_ROW = 2;
const END_ROW = 20;
const SHEET_TITLE = "Qualifier Lobby";

const data = new SlashCommandBuilder()
  .setName("qualifier")
  .setDescription("Sign up for a qualifier lobby")
  .addStringOption((id:any) =>
    id.setName("matchid").setDescription("Match ID from the sheet").setRequired(true)
  );

function findMatchID(sheet:any, matchId:any) {
  for (let row = START_ROW; row <= END_ROW; row++) {
    const idVal = sheet.getCellByA1(`${MATCH_ID_COL}${row}`).value;
    if (idVal && idVal.toString() === matchId) return row;
  }
  return -1;
}

function checkIfUserExist(sheet:any, userId:any) {
  for (let row = START_ROW; row <= END_ROW; row++) {
    for (const col of SLOT_COLUMNS) {
      const v = sheet.getCellByA1(`${col}${row}`).value;
      if (v && v.toString() === userId) {
        return { row, col };
      }
    }
  }
  return null;
}

function findFirstEmptySlot(sheet:any, matchRow:any) {
  for (const col of SLOT_COLUMNS) {
    const cell = sheet.getCellByA1(`${col}${matchRow}`);
    const v = cell.value;
    if (!v || v.toString().trim() === "") return col;
  }
  return null;
}

async function execute(interaction:any) {
  const matchId = interaction.options.getString("matchid");
  const userId = interaction.user.id;

  const doc = getDoc();
  await doc.updateProperties({ timeZone: "GMT+08:00" });

  const sheet = doc.sheetsByTitle[SHEET_TITLE];
  if (!sheet) {
    await interaction.reply({ content: `Sheet '${SHEET_TITLE}' not found`, flags: 1 << 6 });
    return;
  }

  await sheet.loadCells(`A${START_ROW}:R${END_ROW}`);

  const matchRow = findMatchID(sheet, matchId);
  if (matchRow === -1) {
    await interaction.reply({ content: `Qualifier ID ${matchId} not found`, flags: 1 << 6 });
    return;
  }

  const existing = checkIfUserExist(sheet, userId);
  if (existing && existing.row === matchRow) {
    await interaction.reply({ content: `Why are you signing the same Qualifier Lobby: **${matchId}**`, flags: 1 << 6 });
    return;
  }

  if (existing) {
    sheet.getCellByA1(`${existing.col}${existing.row}`).value = "";
  }

  const targetCol = findFirstEmptySlot(sheet, matchRow);
  if (!targetCol) {
    await interaction.reply({ content: `Qualifier: **${matchId}** Slot is full`, flags: 1 << 6 });
    return;
  }

  sheet.getCellByA1(`${targetCol}${matchRow}`).value = userId;

  await sheet.saveUpdatedCells();

  await interaction.reply(`You have signed up for qualifier ${matchId} in slot ${targetCol}`);
}

module.exports = { data, execute };