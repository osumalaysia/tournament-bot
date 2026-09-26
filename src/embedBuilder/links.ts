import { EMBED_FIX_DOMAINS } from "../config";
import type { InstagramPost, XPost } from "./types";

const INSTAGRAM_POST_LINK_PATTERN = /https?:\/\/(?:www\.)?instagram\.com\/((?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+))/gi;
const X_POST_LINK_PATTERN = /https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(\w{1,15}\/status\/\d+)/gi;
const HIDDEN_LINK_PATTERN = /\|\|[\s\S]*?\|\||<[^>\s]+>/g;

function removeHiddenLinks(messageContent: string): string {
  return messageContent.replace(HIDDEN_LINK_PATTERN, " ");
}

export function findInstagramPosts(messageContent: string): InstagramPost[] {
  return [...removeHiddenLinks(messageContent).matchAll(INSTAGRAM_POST_LINK_PATTERN)].map((linkMatch) => ({
    shortcode: linkMatch[2]!,
    originalLink: `https://www.instagram.com/${linkMatch[1]}`,
    embedFixLink: `https://${EMBED_FIX_DOMAINS.INSTAGRAM}/${linkMatch[1]}`,
  }));
}

export function findXPosts(messageContent: string): XPost[] {
  return [...removeHiddenLinks(messageContent).matchAll(X_POST_LINK_PATTERN)].map((linkMatch) => ({
    statusPath: linkMatch[1]!,
    originalLink: `https://x.com/${linkMatch[1]}`,
    embedFixLink: `https://${EMBED_FIX_DOMAINS.X}/${linkMatch[1]}`,
  }));
}

export function hasOnlyLinks(messageContent: string): boolean {
  return messageContent
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => findInstagramPosts(word).length + findXPosts(word).length === 1);
}
