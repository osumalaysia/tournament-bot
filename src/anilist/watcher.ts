import { EmbedBuilder, type Client } from "discord.js";
import { fetchAnimeListActivities, resolveUserId } from "./anilistClient";
import type { AniListListActivity } from "./types";

const ANILIST_COLOR = 0x02a9ff;
const EPISODE_STATUS_PATTERN = /episode/i;

export interface AniListWatcherOptions {
  username: string;
  channelId: string;
  intervalMs: number;
}

function extractEpisodeNumber(progress: string | null): string {
  if (!progress) return "?";
  const match = progress.match(/(\d+)\s*$/);
  return match ? match[1]! : progress;
}

function buildEpisodeEmbed(activity: AniListListActivity): EmbedBuilder {
  const media = activity.media;
  const title = media?.title.userPreferred ?? media?.title.romaji ?? media?.title.english ?? "Unknown anime";
  const episode = extractEpisodeNumber(activity.progress);
  const totalEpisodes = media?.episodes ? ` / ${media.episodes}` : "";

  return new EmbedBuilder()
    .setColor(ANILIST_COLOR)
    .setAuthor({ name: "AniList", iconURL: "https://anilist.co/img/icons/android-chrome-512x512.png" })
    .setTitle(title)
    .setURL(media?.siteUrl ?? "https://anilist.co")
    .setThumbnail(media?.coverImage.large ?? null)
    .setDescription(`Watched episode **${episode}${totalEpisodes}**`)
    .addFields({ name: "When", value: `<t:${activity.createdAt}:R>`, inline: true })
    .setFooter({ text: `Activity #${activity.id}` });
}

export function startAniListWatcher(client: Client, options: AniListWatcherOptions): void {
  if (!options.channelId) {
    console.warn("[anilist] No channel ID configured, watcher will not start.");
    return;
  }

  let userId: number | null = null;
  let lastSeenId: number | null = null;
  let polling = false;

  async function poll(): Promise<void> {
    if (polling) return;
    polling = true;

    try {
      if (userId === null) {
        userId = await resolveUserId(options.username);
        console.log(`[anilist] Resolved user "${options.username}" to id ${userId}`);
      }

      const activities = await fetchAnimeListActivities(userId, 25);
      if (activities.length === 0) return;

      const sortedAscending = [...activities].sort((a, b) => a.id - b.id);

      if (lastSeenId === null) {
        lastSeenId = sortedAscending[sortedAscending.length - 1]!.id;
        console.log(`[anilist] Initialized state at activity #${lastSeenId}, will post new activity going forward.`);
        return;
      }

      if (lastSeenId === null) return;

      const seenId = lastSeenId;
      const newActivities = sortedAscending.filter((activity) => activity.id > seenId);
      if (newActivities.length === 0) return;

      const channel = await client.channels.fetch(options.channelId).catch(() => null);
      if (!channel || !channel.isSendable()) {
        console.error(`[anilist] Configured channel ${options.channelId} is not a sendable text channel.`);
        return;
      }

      for (const activity of newActivities) {
        if (EPISODE_STATUS_PATTERN.test(activity.status) && activity.media) {
          await channel.send({ embeds: [buildEpisodeEmbed(activity)] });
        }
      }

      lastSeenId = newActivities[newActivities.length - 1]!.id;
    } catch (err) {
      console.error("[anilist] Poll failed:", err instanceof Error ? err.message : err);
    } finally {
      polling = false;
    }
  }

  poll();
  setInterval(poll, options.intervalMs);
}
