const { SlashCommandBuilder, EmbedBuilder,ChatInputCommandInteraction } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { GoogleSpreadsheetWorksheet } = require("google-spreadsheet");
const { CONFIG,QUALIFIER } = require("../config");
const cooldownMap = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("drop yourself from a qualifier lobby");

function findMatchRow(sheet: typeof GoogleSpreadsheetWorksheet, matchId: string): number {
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_MATCH_ROWS; row++) {
    const cell = sheet.getCellByA1(`${QUALIFIER.COLUMNS.MATCH_ID}${row}`);
    if (cell.value?.toString().toUpperCase() === matchId.toUpperCase()) {
      return row;
    }
  }
  return -1;
}

function findExistingUser(sheet: typeof GoogleSpreadsheetWorksheet, username: string): { row: number; col: string } | null {
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_MATCH_ROWS; row++) {
    for (const col of QUALIFIER.COLUMNS.PLAYER_SLOTS) {
      const cellValue = sheet.getCellByA1(`${col}${row}`).value;
      if (cellValue?.toString() === username) {
        return { row, col };
      }
    }
  }
  return null;
}

function getUsernameAndMatchFromDiscordId(playerSheet: typeof GoogleSpreadsheetWorksheet, discordId: string): { username: string, matchId: string } | null {
  for (let r = 1; r <= QUALIFIER.LIMITS.MAX_PLAYER_ROWS; r++) {
    const discordIdCell = playerSheet.getCellByA1(`C${r}`).value;
    if (discordIdCell?.toString().trim() === discordId) {
      const username = playerSheet.getCellByA1(`A${r}`).value?.toString() || "";
      const matchId = playerSheet.getCellByA1(`D${r}`).value?.toString() || "";
      playerSheet.getCellByA1(`D${r}`).value = "";
      return { username, matchId };
    }
  }
  return null;
}

export async function execute(interaction: typeof ChatInputCommandInteraction): Promise<void> {
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
  cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);

  if (interaction.channelId !== CONFIG.SIGNUP_CHANNEL_ID) {
    await interaction.reply({ content: "wrong channel blud", ephemeral: true });
    return;
  }

  const memberRoles = interaction.member?.roles;
  const hasRole = Array.isArray(memberRoles) ? memberRoles.includes(CONFIG.TRYOUT_ROLE_ID) : (memberRoles as any)?.cache.has(CONFIG.TRYOUT_ROLE_ID);

  if (!hasRole) {
    await interaction.reply({ content: "You do not have the required role.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const doc = await getDoc(QUALIFIER.SHEET_ID);
    
    const playerSheet = doc.sheetsByTitle[QUALIFIER.SHEETS.PLAYER_LIST];
    const scheduleSheet = doc.sheetsByTitle[QUALIFIER.SHEETS.SCHEDULE];
    const lastSlotCol = QUALIFIER.COLUMNS.PLAYER_SLOTS[QUALIFIER.COLUMNS.PLAYER_SLOTS.length - 1];

    await Promise.all([
      playerSheet.loadCells(`A1:D${QUALIFIER.LIMITS.MAX_PLAYER_ROWS}`),
      scheduleSheet.loadCells(`A1:${lastSlotCol}${QUALIFIER.LIMITS.MAX_MATCH_ROWS}`)
    ]);

    const userInfo = getUsernameAndMatchFromDiscordId(playerSheet, interaction.user.id);

    if (!userInfo || !userInfo.username) {
      await interaction.editReply({ content: "Error: Could not find your Discord ID in the registered player list." });
      return;
    }

    const { username, matchId } = userInfo;

    if (!matchId) {
      await interaction.editReply({ content: `You are not currently signed up for any qualifier.` });
      return;
    }

    const matchRow = findMatchRow(scheduleSheet, matchId);
    if (matchRow === -1) {
      await interaction.editReply({ content: `Could not find Qualifier ID: **${matchId}**` });
      return;
    }

    const existingUser = findExistingUser(scheduleSheet, username);
    if (existingUser) {
      scheduleSheet.getCellByA1(`${existingUser.col}${existingUser.row}`).value = "";
    } else {
      await interaction.editReply({ content: `You are not signed up for qualifier **${matchId}**.` });
      return;
    }

    await Promise.all([
      playerSheet.saveUpdatedCells(),
      scheduleSheet.saveUpdatedCells()
    ]);

    await interaction.editReply({ content: `Successfully removed **${username}** from qualifier **${matchId}**.` });
    
    const logChannel = await interaction.client.channels.fetch(CONFIG.LOG_CHANNEL_ID);
    if (logChannel && 'send' in logChannel) {
      const embed = new EmbedBuilder()
        .setDescription(`**${username}** has dropped from qualifier **${matchId}**.`);
      await logChannel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error("Error updating qualifier sheet:", error);
    await interaction.editReply({ content: "An error occurred while trying to update the schedule. Please try again later." });
  }
}
