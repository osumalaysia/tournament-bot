import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  type Interaction,
} from "discord.js";
import { logErrorToDiscord } from "../utils/errorLogger";

const DELETE_BUTTON_ID_PREFIX = "embed_delete:";

export function buildPostButtonRow(linkPosterId: string, originalLink: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setURL(originalLink)
      .setLabel("Open Post")
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setCustomId(`${DELETE_BUTTON_ID_PREFIX}${linkPosterId}`)
      .setLabel("🗑️ Delete")
      .setStyle(ButtonStyle.Danger),
  );
}

export async function handleDeleteButton(interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.customId.startsWith(DELETE_BUTTON_ID_PREFIX)) return;

  const linkPosterId = interaction.customId.slice(DELETE_BUTTON_ID_PREFIX.length);
  const isLinkPoster = interaction.user.id === linkPosterId;
  const isModerator = interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false;

  try {
    if (!isLinkPoster && !isModerator) {
      await interaction.reply({ content: "Only the person who posted the link can delete this.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    await interaction.deleteReply();
  } catch (error) {
    await logErrorToDiscord("embed delete button", error);
  }
}
