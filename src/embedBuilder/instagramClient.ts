import { EMBED } from "../config";
import { isTrustedMediaUrl } from "./mediaDownloader";
import type { EmbedPageMediaNode, InstagramPost, MediaItem } from "./types";

const EMBED_CONTEXT_JSON_PATTERN = /"contextJSON":("(?:[^"\\]|\\.)*")/;
const REQUEST_TIMEOUT_MS = 15_000;

export function extractMediaFromEmbedPage(embedPageHtml: string): MediaItem[] | null {
  const contextJsonMatch = embedPageHtml.match(EMBED_CONTEXT_JSON_PATTERN);
  if (!contextJsonMatch) return null;

  const embedContext = JSON.parse(JSON.parse(contextJsonMatch[1]!));
  const postMedia: EmbedPageMediaNode | undefined = embedContext?.gql_data?.shortcode_media;
  if (!postMedia) return null;

  const mediaNodes = postMedia.edge_sidecar_to_children?.edges.map((edge) => edge.node) ?? [postMedia];
  const mediaItems: MediaItem[] = [];
  for (const mediaNode of mediaNodes) {
    const mediaUrl = mediaNode.is_video ? mediaNode.video_url : mediaNode.display_url;
    if (!mediaUrl || !isTrustedMediaUrl(mediaUrl)) return null;
    mediaItems.push({ url: mediaUrl, isVideo: mediaNode.is_video });
  }
  return mediaItems;
}

async function fetchMediaFromEmbedPage(post: InstagramPost): Promise<MediaItem[] | null> {
  const response = await fetch(`https://www.instagram.com/p/${post.shortcode}/embed/captioned/`, {
    headers: { "User-Agent": EMBED.CRAWLER_USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return extractMediaFromEmbedPage(await response.text());
}

async function fetchMediaFromEmbedFixSite(post: InstagramPost): Promise<MediaItem[] | null> {
  const response = await fetch(post.embedFixLink, {
    headers: { "User-Agent": EMBED.CRAWLER_USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await response.body?.cancel();

  const mediaUrl = response.headers.get("location");
  if (!mediaUrl || !isTrustedMediaUrl(mediaUrl)) return null;
  return [{ url: mediaUrl, isVideo: new URL(mediaUrl).pathname.endsWith(".mp4") }];
}

export async function fetchPostMedia(post: InstagramPost): Promise<MediaItem[] | null> {
  const mediaItems = (await fetchMediaFromEmbedPage(post).catch(() => null)) ?? (await fetchMediaFromEmbedFixSite(post));
  return mediaItems && mediaItems.length > 0 ? mediaItems : null;
}
