import { EMBED } from "../config";
import { AttachmentBuilder, GuildPremiumTier, type Guild } from "discord.js";
import type { MediaItem } from "./types";

const BYTES_PER_MEGABYTE = 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export function isTrustedMediaUrl(mediaUrl: string): boolean {
  try {
    const parsedUrl = new URL(mediaUrl);
    return (
      parsedUrl.protocol === "https:" &&
      EMBED.TRUSTED_MEDIA_HOST_SUFFIXES.some((hostSuffix) => parsedUrl.hostname.endsWith(hostSuffix))
    );
  } catch {
    return false;
  }
}

export function uploadLimitInBytes(guild: Guild | null): number {
  const serverBoostTier = guild?.premiumTier;
  if (serverBoostTier === GuildPremiumTier.Tier3) return 100 * BYTES_PER_MEGABYTE;
  if (serverBoostTier === GuildPremiumTier.Tier2) return 50 * BYTES_PER_MEGABYTE;
  return 10 * BYTES_PER_MEGABYTE;
}

export async function readBodyWithinLimit(response: Response, byteLimit: number): Promise<Buffer | null> {
  if (!response.body) return null;

  const bodyReader = response.body.getReader();
  const receivedChunks: Uint8Array[] = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await bodyReader.read();
    if (done) break;

    receivedBytes += value.byteLength;
    if (receivedBytes > byteLimit) {
      await bodyReader.cancel();
      return null;
    }
    receivedChunks.push(value);
  }
  return Buffer.concat(receivedChunks);
}

export interface DownloadBudget {
  bytesLeft: number;
}

async function downloadAsAttachment(
  mediaItem: MediaItem,
  fileNumber: number,
  uploadLimit: number,
  downloadBudget: DownloadBudget,
): Promise<AttachmentBuilder | null> {
  if (!isTrustedMediaUrl(mediaItem.url)) return null;

  const byteLimit = Math.min(uploadLimit, downloadBudget.bytesLeft);
  const response = await fetch(mediaItem.url, {
    redirect: "error",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || Number(response.headers.get("content-length")) > byteLimit) {
    await response.body?.cancel();
    return null;
  }

  const fileData = await readBodyWithinLimit(response, byteLimit);
  if (!fileData) return null;
  downloadBudget.bytesLeft -= fileData.length;

  const fileExtension = mediaItem.isVideo ? "mp4" : "jpg";
  return new AttachmentBuilder(fileData, { name: `media_${fileNumber}.${fileExtension}` });
}

export async function downloadAllAsAttachments(
  mediaItems: MediaItem[],
  uploadLimit: number,
  downloadBudget: DownloadBudget,
): Promise<AttachmentBuilder[] | null> {
  const attachments: AttachmentBuilder[] = [];
  for (const [index, mediaItem] of mediaItems.entries()) {
    const attachment = await downloadAsAttachment(mediaItem, index + 1, uploadLimit, downloadBudget).catch(() => null);
    if (!attachment) return null;
    attachments.push(attachment);
  }
  return attachments;
}
