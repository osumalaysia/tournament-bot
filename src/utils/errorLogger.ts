import { EmbedBuilder, type Client } from "discord.js";
import { CONFIG } from "../config";

let client: Client | null = null;

export function initErrorLogger(discordClient: Client): void {
  client = discordClient;
}

export async function logErrorToDiscord(source: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[${source}]`, error);

  if (!client) return;

  const channel = await client.channels.fetch(CONFIG.ERROR_LOG_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isSendable()) return;

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`Error in ${source}`)
    .setDescription((message || "(no message)").slice(0, 4096))
    .setTimestamp();

  if (stack) {
    embed.addFields({ name: "Stack", value: `\`\`\`${stack.slice(0, 1000)}\`\`\`` });
  }

  await channel.send({ embeds: [embed] }).catch(() => null);
}
