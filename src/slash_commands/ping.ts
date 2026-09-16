const { SlashCommandBuilder, CommandInteraction } = require("discord.js");

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!");

export async function execute(
  interaction:typeof CommandInteraction
) {
  await interaction.reply({ content: "You have scheduled your lobby to $!", flags: 1 << 6 });
}