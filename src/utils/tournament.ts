import type { ChatInputCommandInteraction, EmbedBuilder, Guild, GuildEmoji } from "discord.js";
import { CONFIG, TOURNAMENT } from "../config";

export async function ensureReferee(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: "Thoughts you can use it in a dm huh!" });
    return false;
  }
  if (!interaction.member.roles.cache.has(TOURNAMENT.REFEREE_ROLE_ID) && interaction.user.id !== CONFIG.DEVELOPER_ID) {
    await interaction.reply({ content: "Don't be an asshole", flags: 1 << 6 });
    return false;
  }
  return true;
}

async function createProfileEmoji(emojiGuild: Guild | undefined, osuUserId: string, name: string): Promise<GuildEmoji | null> {
  try {
    const avatar = await fetch(`https://a.ppy.sh/${osuUserId}`);
    return await emojiGuild!.emojis.create({ attachment: Buffer.from(await avatar.arrayBuffer()), name });
  } catch {
    return null;
  }
}

export async function withProfileEmojis<T>(
  interaction: ChatInputCommandInteraction,
  osuUserIds: string[],
  use: (emojis: string[]) => Promise<T>,
): Promise<T> {
  const emojiGuild = interaction.client.guilds.cache.get(TOURNAMENT.EMOJI_GUILD_ID);
  const emojis = await Promise.all(osuUserIds.map((id, index) => createProfileEmoji(emojiGuild, id, `p${index + 1}`)));
  try {
    return await use(emojis.map((emoji) => emoji?.toString() ?? ""));
  } finally {
    await Promise.all(emojis.map((emoji) => emoji?.delete().catch(() => null)));
  }
}

export async function postResult(interaction: ChatInputCommandInteraction, matchId: string, embed: EmbedBuilder): Promise<void> {
  const channel = await interaction.client.channels.fetch(TOURNAMENT.RESULT_CHANNEL_ID);
  if (!channel?.isSendable()) throw new Error("Result channel not found");
  await channel.send({ embeds: [embed] });
  await interaction.reply({ content: `Match ${matchId} submitted successfully!` });
}
