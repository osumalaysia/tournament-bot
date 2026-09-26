import { EMBED } from "../config";
import { isTrustedMediaUrl } from "./mediaDownloader";
import type { XPost, XPostDetails } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

interface FxTwitterMedia {
  type: string;
  url: string;
}

interface FxTwitterResponse {
  tweet?: {
    text: string;
    likes: number;
    retweets: number;
    created_timestamp: number;
    author: { name: string; screen_name: string; avatar_url: string | null };
    media?: { all?: FxTwitterMedia[] };
  };
}

export function toXPostDetails(apiResponse: FxTwitterResponse): XPostDetails | null {
  const tweet = apiResponse.tweet;
  if (!tweet) return null;

  const mediaItems = (tweet.media?.all ?? []).map((media) => ({ url: media.url, isVideo: media.type !== "photo" }));
  if (!mediaItems.every((mediaItem) => isTrustedMediaUrl(mediaItem.url))) return null;

  return {
    authorName: tweet.author.name,
    authorHandle: tweet.author.screen_name,
    authorAvatarUrl: tweet.author.avatar_url,
    text: tweet.text,
    likeCount: tweet.likes,
    repostCount: tweet.retweets,
    postedAt: new Date(tweet.created_timestamp * 1000),
    mediaItems,
  };
}

export async function fetchXPostDetails(post: XPost): Promise<XPostDetails | null> {
  const response = await fetch(`${EMBED.FXTWITTER_API_URL}/${post.statusPath}`, {
    headers: { "User-Agent": "Sagisawa-Arisu-Bot" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return toXPostDetails(await response.json());
}
