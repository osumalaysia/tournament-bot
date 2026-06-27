const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const TOURNAMENT_NAME = "o!M4T 2026";
const EMOJI_GUILD_ID = "905398607895752735";
const TARGET_CHANNEL_ID = "1457807376546533386";
const ROLE_ID = "1457806106058297518";
const { CONFIG } = require("../config");

async function makeEmoji(emojiGuild: any, userId: any, name = "profile") {
    try {
        const res = await fetch(`https://a.ppy.sh/${userId}`);
        const buf = Buffer.from(await res.arrayBuffer());
        return await emojiGuild.emojis.create({ attachment: buf, name });
    } catch {
        return null;
    }
}

export const data = new SlashCommandBuilder()
    .setName("forfeit")
    .setDescription("output result")
    .addStringOption((matchid: any) =>
        matchid.setName("matchid").setDescription("Match ID from the schedule sheet tab").setRequired(true)
    )
    .addStringOption((stages: any) =>
        stages.setName("stages").setDescription("Stages of the match").setRequired(true)
    )
    .addStringOption((forfeit: any) =>
        forfeit.setName("forfeit_player").setDescription("Player 1").setRequired(true)
    )
    .addStringOption((winner: any) =>
        winner.setName("winner_player").setDescription("Player 2").setRequired(true)
    )
    .addStringOption((forfeitSeed: any) =>
        forfeitSeed.setName("player1seed").setDescription("Player 1 Seed").setRequired(true)
    )
    .addStringOption((winnerSeed: any) =>
        winnerSeed.setName("player2seed").setDescription("Player 2 Seed").setRequired(true)
    )
    .addStringOption((forfeitId: any) =>
        forfeitId.setName("forfeit_id").setDescription("Player 1 ID").setRequired(true)
    )
    .addStringOption((winnerId: any) =>
        winnerId.setName("winner_id").setDescription("Player 2 ID").setRequired(true)
    );

export async function execute(interaction: any) {

    if (!interaction.member.roles.cache.has(ROLE_ID) || interaction.user.id !== CONFIG.DEVELOPER_ID) {
        await interaction.reply({ content: "Don't be an asshole", flags: 1 << 6 });
        return;
    } else if (!interaction.inGuild()) {
        await interaction.reply({ content: "Thoughts you can use it in a dm huh!" });
        return;
    }

    const emojiGuild = interaction.client.guilds.cache.get(EMOJI_GUILD_ID)
    const channel = interaction.client.channels.cache.get(TARGET_CHANNEL_ID)

    const iconURL = interaction.guild?.iconURL({ size: 512, extension: "png" }) || undefined;
    const [forfeitProfile, winnerProfile] = await Promise.all([
        makeEmoji(emojiGuild, interaction.options.getString("forfeit_id"), "p1"),
        makeEmoji(emojiGuild, interaction.options.getString("winner_id"), "p2"),
    ]);

    const data = {
        matchId: interaction.options.getString("matchid"),
        stages: interaction.options.getString("stages"),
        forfeit: interaction.options.getString("forfeit_player"),
        winner: interaction.options.getString("winner_player"),
        forfeitSeed: interaction.options.getString("player1seed"),
        winnerSeed: interaction.options.getString("player2seed"),
        forfeitId: interaction.options.getString("forfeit_id"),
        winnerId: interaction.options.getString("winner_id"),
    };

    const resultEmbed = new EmbedBuilder()
        .setAuthor({ name: `${data.stages}: Match ${data.matchId}` })
        .setTitle(`Win by Default for ${data.winner} #${data.winnerSeed} ${winnerProfile || ""}`)
        .setDescription(
            `**${data.forfeit}** #${data.forfeitSeed} ${forfeitProfile || ""} has forfeited the match.`
        )
        .setFooter({ text: `${TOURNAMENT_NAME}` })
        .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });
    await interaction.reply({ content: `Match ${data.matchId} submitted successfully!` });
    await Promise.all([forfeitProfile, winnerProfile].map(emoji => emoji.delete()));

}

module.exports = { data, execute };
export { };