const { SlashCommandBuilder, EmbedBuilder, GuildMemberRoleManager, ChatInputCommandInteraction } = require("discord.js");
const { getDoc } = require("../handler/googleSheetAuth");
const { GoogleSpreadsheetWorksheet } = require("google-spreadsheet");
const { CONFIG, QUALIFIER } = require("../config");

const cooldownMap = new Map<string, number>();

export const data = new SlashCommandBuilder()
  .setName("qualifier")
  .setDescription("Sign up for a qualifier lobby")
  .addStringOption((id: any) =>
    id.setName("matchid").setDescription("Match ID from the sheet").setRequired(true)
  );

function findMatchRow(sheet: typeof GoogleSpreadsheetWorksheet, matchId: string): number {
  const targetId = matchId.toUpperCase();
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_MATCH_ROWS; row++) {
    const cellValue = sheet.getCellByA1(`${QUALIFIER.COLUMNS.MATCH_ID}${row}`).value?.toString();
    if (cellValue?.toUpperCase() === targetId) return row;
  }
  return -1;
}

function findExistingUserSlot(sheet: typeof GoogleSpreadsheetWorksheet, username: string): { row: number; col: string } | null {
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_MATCH_ROWS; row++) {
    for (const col of QUALIFIER.COLUMNS.PLAYER_SLOTS) {
      if (sheet.getCellByA1(`${col}${row}`).value?.toString() === username) {
        return { row, col };
      }
    }
  }
  return null;
}

function findFirstEmptySlot(sheet: typeof GoogleSpreadsheetWorksheet, matchRow: number): string | null {
  for (const col of QUALIFIER.COLUMNS.PLAYER_SLOTS) {
    const cellValue = sheet.getCellByA1(`${col}${matchRow}`).value;
    if (!cellValue || cellValue.toString().trim() === "") return col;
  }
  return null;
}

function findPlayerDataByDiscordId(playerSheet: typeof GoogleSpreadsheetWorksheet, discordId: string): { username: string; row: number } | null {
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_PLAYER_ROWS; row++) {
    const currentId = playerSheet.getCellByA1(`${QUALIFIER.COLUMNS.DISCORD_ID}${row}`).value?.toString().trim();
    if (currentId === discordId) {
      const username = playerSheet.getCellByA1(`${QUALIFIER.COLUMNS.PLAYER_NAME}${row}`).value?.toString();
      return username ? { username, row } : null;
    }
  }
  return null;
}

function checkPlayerPlayedBefore(playerSheet: typeof GoogleSpreadsheetWorksheet, username: string): boolean {
  for (let row = 1; row <= QUALIFIER.LIMITS.MAX_PLAYER_ROWS; row++) {
      if (playerSheet.getCellByA1(`${QUALIFIER.COLUMNS.PLAYER_NAME}${row}`).value?.toString() === username) {
        const checkbBoxIfPlayed = playerSheet.getCellByA1(`${QUALIFIER.COLUMNS.PLAYER_PLAYED_BEFORE}${row}`).value;
        if (checkbBoxIfPlayed === true) {
          return true;
        }
      }
    }
  return false;
  }


export async function execute(interaction: typeof ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  if (interaction.channelId !== CONFIG.SIGNUP_CHANNEL_ID) {
    await interaction.reply({ content: "This command cannot be used in this channel.", ephemeral: true });
    return;
  }

  const now = Date.now();
  if (cooldownMap.has(userId)) {
    const expirationTime = cooldownMap.get(userId)!;
    if (now < expirationTime) {
      const timeLeft = Math.round((expirationTime - now) / 1000);
      await interaction.reply({ content: `Please wait ${timeLeft} more second(s) before using this command again.`, ephemeral: true });
      return;
    }
  }

  const roles = interaction.member?.roles;
  const hasRole = roles instanceof GuildMemberRoleManager
    ? roles.cache.has(CONFIG.TRYOUT_ROLE_ID)
    : Array.isArray(roles) && roles.includes(CONFIG.TRYOUT_ROLE_ID);

  if (!hasRole) {
    await interaction.reply({ content: "You do not have the required role to sign up.", ephemeral: true });
    return;
  }

  cooldownMap.set(userId, now + CONFIG.COOLDOWN_SECONDS * 1000);
  await interaction.deferReply({ ephemeral: true });

  try {
    const doc = await getDoc(QUALIFIER.SHEET_ID);
    const matchId = interaction.options.getString("matchid")?.toUpperCase() ?? "";

    const playerSheet = doc.sheetsByTitle[QUALIFIER.SHEETS.PLAYER_LIST];
    const scheduleSheet = doc.sheetsByTitle[QUALIFIER.SHEETS.SCHEDULE];
    const lastSlotCol = QUALIFIER.COLUMNS.PLAYER_SLOTS[QUALIFIER.COLUMNS.PLAYER_SLOTS.length - 1];

    await Promise.all([
      playerSheet.loadCells(`A1:F${QUALIFIER.LIMITS.MAX_PLAYER_ROWS}`),
      scheduleSheet.loadCells(`A1:${lastSlotCol}${QUALIFIER.LIMITS.MAX_MATCH_ROWS}`)
    ]);

    const playerData = findPlayerDataByDiscordId(playerSheet, userId);
    if (!playerData) {
      await interaction.editReply({ content: "Error: Your Discord ID was not found in the Player List." });
      return;
    }

    const matchRow = findMatchRow(scheduleSheet, matchId);
    if (matchRow === -1) {
      await interaction.editReply({ content: `Could not find Qualifier ID: **${matchId}**` });
      return;
    }

    const existingRegistration = findExistingUserSlot(scheduleSheet, playerData.username);
    if (existingRegistration) {
      if (existingRegistration.row === matchRow) {
        await interaction.editReply({ content: `You are already registered for lobby **${matchId}**.` });
        return;
      }
      scheduleSheet.getCellByA1(`${existingRegistration.col}${existingRegistration.row}`).value = "";
    }
    const hasPlayedBefore = checkPlayerPlayedBefore(playerSheet, playerData.username);
    if (hasPlayedBefore) {
      await interaction.editReply({ content: `You have already participated in a qualifier. You cannot sign up again.` });
      return;
    }

    const targetCol = findFirstEmptySlot(scheduleSheet, matchRow);
    if (!targetCol) {
      await interaction.editReply({ content: `Qualifier **${matchId}** is full. Please try another lobby.` });
      return;
    }

    scheduleSheet.getCellByA1(`${targetCol}${matchRow}`).value = playerData.username;
    playerSheet.getCellByA1(`${QUALIFIER.COLUMNS.CACHE_ASSIGNED_MATCH}${playerData.row}`).value = matchId;

    await Promise.all([
      playerSheet.saveUpdatedCells(),
      scheduleSheet.saveUpdatedCells()
    ]);

    await interaction.editReply({ content: `Successfully assigned **${playerData.username}** to **${matchId}** (Slot ${targetCol}).` });

    const logChannel = await interaction.client.channels.fetch(CONFIG.LOG_CHANNEL_ID);
    if (logChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setDescription(`**${playerData.username}** has signed up for qualifier Match **${matchId}**.`)
        .setColor(0x00FF00);
      await logChannel.send({ embeds: [embed] });
    }

  } catch (error) {
    console.error("Signup Command Exception:", error);
    await interaction.editReply({
      content: `An error occurred while updating the schedule. <@${CONFIG.DEVELOPER_ID}> has been notified.`
    });
  }
}
module.exports = { data, execute };
