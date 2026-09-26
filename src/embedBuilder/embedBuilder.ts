import {
  EmbedBuilder,
  type ActionRowBuilder,
  type AttachmentBuilder,
  type ButtonBuilder,
  type Client,
  type Message,
} from "discord.js";
import { logErrorToDiscord } from "../utils/errorLogger";
import { fetchPostMedia } from "./instagramClient";
import { findInstagramPosts, findXPosts, hasOnlyLinks } from "./links";
import { downloadAllAsAttachments, uploadLimitInBytes, type DownloadBudget } from "./mediaDownloader";
import { buildPostButtonRow, handleDeleteButton } from "./postButtons";
import type { InstagramPost, XPost, XPostDetails } from "./types";
import { fetchXPostDetails } from "./xClient";

const MAX_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_POSTS_PER_MESSAGE = 5;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const X_EMBED_COLOR = 0x1d9bf0;
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat("en", { notation: "compact" });
const WITHOUT_PINGS = { parse: [] };

interface PreparedReply {
  content: string;
  embeds?: EmbedBuilder[];
  files?: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions: typeof WITHOUT_PINGS;
}

interface ReplyContext {
  requesterId: string;
  uploadLimit: number;
  downloadBudget: DownloadBudget;
}

interface PostHandler {
  fallbackReply: (replyContext: ReplyContext) => PreparedReply;
  prepareReplies: (replyContext: ReplyContext) => Promise<PreparedReply[]>;
}

function splitIntoMessageSizedGroups<Item>(items: Item[]): Item[][] {
  const groups: Item[][] = [];
  for (let startIndex = 0; startIndex < items.length; startIndex += MAX_ATTACHMENTS_PER_MESSAGE) {
    groups.push(items.slice(startIndex, startIndex + MAX_ATTACHMENTS_PER_MESSAGE));
  }
  return groups;
}

function buildReplyContent(replyContext: ReplyContext, maskedEmbedLink?: string): string {
  const requestedByLine = `Requested by <@${replyContext.requesterId}>`;
  return maskedEmbedLink ? `${requestedByLine}\n${maskedEmbedLink}` : requestedByLine;
}

function buildMaskedLinkReply(
  linkLabel: string,
  post: InstagramPost | XPost,
  replyContext: ReplyContext,
): PreparedReply {
  return {
    content: buildReplyContent(replyContext, `[${linkLabel}](${post.embedFixLink})`),
    components: [buildPostButtonRow(replyContext.requesterId, post.originalLink)],
    allowedMentions: WITHOUT_PINGS,
  };
}

async function prepareInstagramReplies(post: InstagramPost, replyContext: ReplyContext): Promise<PreparedReply[]> {
  const mediaItems = await fetchPostMedia(post).catch(() => null);
  const attachments = mediaItems
    ? await downloadAllAsAttachments(mediaItems, replyContext.uploadLimit, replyContext.downloadBudget)
    : null;
  if (!attachments) return [buildMaskedLinkReply("Instagram", post, replyContext)];

  return splitIntoMessageSizedGroups(attachments).map((attachmentGroup) => ({
    content: buildReplyContent(replyContext),
    files: attachmentGroup,
    components: [buildPostButtonRow(replyContext.requesterId, post.originalLink)],
    allowedMentions: WITHOUT_PINGS,
  }));
}

export function buildXPostEmbed(postDetails: XPostDetails): EmbedBuilder {
  const statsLine = `❤ ${COMPACT_NUMBER_FORMAT.format(postDetails.likeCount)}  🔁 ${COMPACT_NUMBER_FORMAT.format(postDetails.repostCount)}`;
  const embed = new EmbedBuilder()
    .setColor(X_EMBED_COLOR)
    .setAuthor({
      name: `${postDetails.authorName} (@${postDetails.authorHandle})`,
      ...(postDetails.authorAvatarUrl ? { iconURL: postDetails.authorAvatarUrl } : {}),
    })
    .setDescription(postDetails.text.slice(0, MAX_EMBED_DESCRIPTION_LENGTH) || null)
    .setFooter({ text: statsLine });
  if (!Number.isNaN(postDetails.postedAt.getTime())) embed.setTimestamp(postDetails.postedAt);
  return embed;
}

async function prepareXReplies(post: XPost, replyContext: ReplyContext): Promise<PreparedReply[]> {
  const postDetails = await fetchXPostDetails(post).catch(() => null);
  const attachments = postDetails
    ? await downloadAllAsAttachments(postDetails.mediaItems, replyContext.uploadLimit, replyContext.downloadBudget)
    : null;
  if (!postDetails || !attachments) return [buildMaskedLinkReply("X", post, replyContext)];

  return [{
    content: buildReplyContent(replyContext),
    embeds: [buildXPostEmbed(postDetails)],
    files: attachments,
    components: [buildPostButtonRow(replyContext.requesterId, post.originalLink)],
    allowedMentions: WITHOUT_PINGS,
  }];
}

function uniqueByOriginalLink<Post extends InstagramPost | XPost>(posts: Post[]): Post[] {
  return [...new Map(posts.map((post) => [post.originalLink, post])).values()];
}

function findPosts(messageContent: string): PostHandler[] {
  const instagramPosts = uniqueByOriginalLink(findInstagramPosts(messageContent)).map((post): PostHandler => ({
    fallbackReply: (replyContext) => buildMaskedLinkReply("Instagram", post, replyContext),
    prepareReplies: (replyContext) => prepareInstagramReplies(post, replyContext),
  }));
  const xPosts = uniqueByOriginalLink(findXPosts(messageContent)).map((post): PostHandler => ({
    fallbackReply: (replyContext) => buildMaskedLinkReply("X", post, replyContext),
    prepareReplies: (replyContext) => prepareXReplies(post, replyContext),
  }));
  return [...instagramPosts, ...xPosts];
}

async function replyWithEmbeds(message: Message): Promise<void> {
  if (message.author.bot) return;

  const posts = findPosts(message.content);
  if (posts.length === 0 || !message.channel.isSendable()) return;
  const channel = message.channel;

  let processingMessage: Message | null = null;
  const sendReply = async (reply: PreparedReply): Promise<void> => {
    if (!processingMessage) {
      await channel.send(reply);
      return;
    }
    await processingMessage.edit(reply);
    processingMessage = null;
  };

  try {
    processingMessage = await channel.send({ content: "Processing...", allowedMentions: WITHOUT_PINGS });

    const replyContext: ReplyContext = {
      requesterId: message.author.id,
      uploadLimit: uploadLimitInBytes(message.guild),
      downloadBudget: { bytesLeft: MAX_DOWNLOAD_BYTES },
    };
    for (const post of posts.slice(0, MAX_POSTS_PER_MESSAGE)) {
      try {
        for (const reply of await post.prepareReplies(replyContext)) {
          await sendReply(reply);
        }
      } catch (error) {
        await logErrorToDiscord("embed builder", error);
        await sendReply(post.fallbackReply(replyContext));
      }
    }

    const canDelete =
      posts.length <= MAX_POSTS_PER_MESSAGE &&
      hasOnlyLinks(message.content) &&
      message.attachments.size === 0 &&
      message.stickers.size === 0;
    const hide = canDelete ? message.delete() : message.suppressEmbeds(true);
    await hide.catch(() => null);
  } catch (error) {
    await processingMessage?.delete().catch(() => null);
    await logErrorToDiscord("embed builder", error);
  }
}

export function startEmbedBuilder(client: Client): void {
  client.on("messageCreate", replyWithEmbeds);
  client.on("interactionCreate", handleDeleteButton);
}
