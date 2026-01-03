const { SlashCommandBuilder } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { referee, streamer, commentator } = require("../../staff.cfg");

const SHEET_NAME = "Schedule";
const SHEET_START_ROW = 10;
const SHEET_END_ROW = 28;
const TIMEZONE_OFFSET = "GMT+08:00";

const roleColumnMap: Record<string, string> = {
  referee: "Q",
  streamer: "R",
  commentator: "S",
};

const getStaffName = (role: string, userId: string) => {
  const arr = ({ referee, streamer, commentator } as any)[role];
  if (!Array.isArray(arr)) return userId;
  const found = arr.find((item: [string | number, string]) => String(item[0]) === String(userId));
  return found ? found[1] : userId;
};

const findMatchRow = (sheet: any, matchId: string) => {
  for (let row = SHEET_START_ROW; row <= SHEET_END_ROW; row++) {
    const id = sheet.getCellByA1(`D${row}`).value;
    if (String(id) === String(matchId)) return row;
  }
  return null;
};

export const data = new SlashCommandBuilder()
  .setName("staff")
  .setDescription("Assign yourself to the Match")
  .addSubcommand((action: any) =>
    action
      .setName("add")
      .setDescription("Add yourself as staff to a match")
      .addStringOption((roles: any) =>
        roles
          .setName("role")
          .setDescription("Choose your staff role")
          .setRequired(true)
          .addChoices(
            { name: "Referee", value: "referee" },
            { name: "Streamer", value: "streamer" },
            { name: "Commentator", value: "commentator" },
          ),
      )
      .addStringOption((matchId: any) =>
        matchId.setName("matchid").setDescription("Match ID from the schedule sheet").setRequired(true),
      ),
  )
  .addSubcommand((action: any) =>
    action
      .setName("drop")
      .setDescription("Remove yourself from staff for a match")
      .addStringOption((roles: any) =>
        roles
          .setName("role")
          .setDescription("Choose your staff role")
          .setRequired(true)
          .addChoices(
            { name: "Referee", value: "referee" },
            { name: "Streamer", value: "streamer" },
            { name: "Commentator", value: "commentator" },
          ),
      )
      .addStringOption((matchId: any) =>
        matchId.setName("matchid").setDescription("Match ID from the schedule sheet").setRequired(true),
      ),
  );

export async function execute(interaction: any) {
  await interaction.deferReply({ flags: 1 << 6 });

  const sub = interaction.options.getSubcommand();
  const role = interaction.options.getString("role");
  const matchId = interaction.options.getString("matchid").toUpperCase();

  const col = roleColumnMap[role];
  if (!col) return interaction.editReply({ content: "Invalid role." });

  const doc = getDoc();
  await doc.updateProperties({ timeZone: TIMEZONE_OFFSET});
  const sheet = doc.sheetsByTitle[SHEET_NAME];
  if (!sheet) return interaction.editReply({ content: `Sheet '${SHEET_NAME}' not found.` });

  await sheet.loadCells(`D${SHEET_START_ROW}:S${SHEET_END_ROW}`);

  const row = findMatchRow(sheet, matchId);
  if (!row) return interaction.editReply({ content: `Match ID ${matchId} not found.` });

  const cell = sheet.getCellByA1(`${col}${row}`);

  if (sub === "add") {
    const staffName = getStaffName(role, interaction.user.id);
    if (staffName === interaction.user.id) {
      return interaction.editReply({ content: `No staff name found for your ID and role "${role}".` });
    }
    cell.value = staffName;
    await sheet.saveUpdatedCells();
    return interaction.editReply({ content: `Added <@${interaction.user.id}> as ${role} (${staffName}) for match ${matchId}.` });
  }

  if (sub === "drop") {
    cell.value = "";
    await sheet.saveUpdatedCells();
    return interaction.editReply({ content: `Removed <@${interaction.user.id}> as ${role} from match ${matchId}.` });
  }

  return interaction.editReply({ content: "Unknown subcommand." });
}

module.exports = { data, execute };