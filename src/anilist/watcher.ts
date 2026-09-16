import { EmbedBuilder, type Client } from "discord.js";
import { fetchAnimeListActivities, resolveUserId } from "./anilistClient";
import type { AniListListActivity } from "./types";

const ANILIST_AVATAR_URL = "https://s4.anilist.co/file/anilistcdn/user/avatar/large/b5856766-5TBEOVvKeWcs.png";

type ActivityKind = "episode" | "completed" | "planning" | "dropped" | "paused" | "rewatching";

interface ActivityKindConfig {
  color: number;
  describe(title: string, activity: AniListListActivity): string;
}

const STATUS_KIND_MATCHERS: Array<[ActivityKind, RegExp]> = [
  ["planning", /plans to watch/i],
  ["rewatching", /rewatch/i],
  ["completed", /completed/i],
  ["dropped", /dropped/i],
  ["paused", /paused/i],
  ["episode", /episode/i],
];

const STATUS_KIND_CONFIG: Record<ActivityKind, ActivityKindConfig> = {
  episode: {
    color: 0x02a9ff,
    describe: (_title, activity) => `Watched ${formatEpisodeProgress(activity.progress, activity.media?.episodes ?? null)}`,
  },
  completed: {
    color: 0x4caf50,
    describe: (title) => `Completed **${title}**`,
  },
  planning: {
    color: 0x9c59d1,
    describe: (title) => `Added **${title}** to Plan to Watch`,
  },
  dropped: {
    color: 0xe74c3c,
    describe: (title) => `Dropped **${title}**`,
  },
  paused: {
    color: 0xf1c40f,
    describe: (title) => `Paused **${title}**`,
  },
  rewatching: {
    color: 0x02a9ff,
    describe: (title) => `Started rewatching **${title}**`,
  },
};

export interface AniListWatcherOptions {
  username: string;
  channelId: string;
  intervalMs: number;
}

function classifyStatus(status: string): ActivityKind | null {
  const match = STATUS_KIND_MATCHERS.find(([, pattern]) => pattern.test(status));
  return match ? match[0] : null;
}

function formatEpisodeProgress(progress: string | null, totalEpisodes: number | null): string {
  const totalSuffix = totalEpisodes ? ` / ${totalEpisodes}` : "";
  const rangeMatch = progress?.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return `episodes **${rangeMatch[1]} - ${rangeMatch[2]}${totalSuffix}**`;
  }

  const singleMatch = progress?.match(/(\d+)\s*$/);
  const episode = singleMatch ? singleMatch[1]! : "?";
  return `episode **${episode}${totalSuffix}**`;
}

function resolveMediaTitle(activity: AniListListActivity): string {
  const title = activity.media?.title;
  return title?.userPreferred ?? title?.romaji ?? title?.english ?? "Unknown anime";
}

function buildActivityEmbed(activity: AniListListActivity, username: string, kind: ActivityKind): EmbedBuilder {
  const media = activity.media;
  const config = STATUS_KIND_CONFIG[kind];
  const title = resolveMediaTitle(activity);

  return new EmbedBuilder()
    .setColor(config.color)
    .setAuthor({ name: username, iconURL: ANILIST_AVATAR_URL ,url: `https://anilist.co/user/${encodeURIComponent(username)}`})
    .setTitle(title)
    .setURL(media?.siteUrl ?? "https://anilist.co")
    .setThumbnail(media?.coverImage.large ?? null)
    .setDescription(config.describe(title, activity))
    .addFields({ name: "When", value: `<t:${activity.createdAt}:R>`, inline: true });
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
        return;
      }

      if (lastSeenId === null) return;

      const seenId = lastSeenId;
      const newActivities = sortedAscending.filter((activity) => activity.id > seenId);
      if (newActivities.length === 0) return;

      const channel = await client.channels.fetch(options.channelId).catch(() => null);
      if (!channel || !channel.isSendable()) {
        return;
      }

      for (const activity of newActivities) {
        const kind = classifyStatus(activity.status);
        if (kind && activity.media) {
          await channel.send({ embeds: [buildActivityEmbed(activity, options.username, kind)] });
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
