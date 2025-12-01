const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

const TOURNAMENT_NAME = "OMAT 2026";
const EMOJI_GUILD_ID = "905398607895752735";
const TARGET_CHANNEL_ID = "907350212320849940";
const ROLE_ID = "905399222486303744";

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
    .setName("result")
    .setDescription("output result")
    .addStringOption((matchid: any) =>
        matchid.setName("matchid").setDescription("Match ID from the schedule sheet tab").setRequired(true)
    )
    .addStringOption((stages: any) =>
        stages.setName("stages").setDescription("Stages of the match").setRequired(true)
    )
    .addStringOption((p1: any) =>
        p1.setName("player1").setDescription("Player 1").setRequired(true)
    )
    .addStringOption((p2: any) =>
        p2.setName("player2").setDescription("Player 2").setRequired(true)
    )
    .addStringOption((p1Id: any) =>
        p1Id.setName("player1id").setDescription("Player 1 ID").setRequired(true)
    )
    .addStringOption((p2Id: any) =>
        p2Id.setName("player2id").setDescription("Player 2 ID").setRequired(true)
    )
    .addStringOption((score1: any) =>
        score1.setName("score1").setDescription("Score of Player 1").setRequired(true)
    )
    .addStringOption((score2: any) =>
        score2.setName("score2").setDescription("Score of Player 2").setRequired(true)
    )
    .addStringOption((mplink: any) =>
        mplink.setName("mplink").setDescription("Multiplayer link").setRequired(true)
    )
    .addStringOption((ban1: any) =>
        ban1.setName("ban1").setDescription("Ban 1").setRequired(true)
    )
    .addStringOption((ban2: any) =>
        ban2.setName("ban2").setDescription("Ban 2").setRequired(true)
    )
    .addStringOption((ban3: any) =>
        ban3.setName("ban3").setDescription("Ban 3").setRequired(true)
    )
    .addStringOption((ban4: any) =>
        ban4.setName("ban4").setDescription("Ban 4").setRequired(true)
    )
    .addStringOption((firstpick: any) =>
        firstpick.setName("firstpick").setDescription("First Pick").setRequired(true)
    )
    .addStringOption((firstban: any) =>
        firstban.setName("firstban").setDescription("First Ban").setRequired(true)
    )
    .addStringOption((referee: any) =>
        referee.setName("referee").setDescription("Other Notes").setRequired(false)
    );

export async function execute(interaction: any) {
    
    if (!interaction.member.roles.cache.has(ROLE_ID)) {
        await interaction.reply({ content: "Don't be an asshole", flags: 1 << 6 });
        return;
    } else if (!interaction.inGuild()) {
        await interaction.reply({ content: "Thoughts you can use it in a dm huh!" });
        return;
    }

    const emojiGuild = interaction.client.guilds.cache.get(EMOJI_GUILD_ID)
    const channel = interaction.client.channels.cache.get(TARGET_CHANNEL_ID)

    const iconURL = interaction.guild?.iconURL({ size: 512, extension: "png" }) || undefined;
    const [p1Profile, p2Profile] = await Promise.all([
        makeEmoji(emojiGuild, interaction.options.getString("player1id"), "p1"),
        makeEmoji(emojiGuild, interaction.options.getString("player2id"), "p2"),
    ]);

    const data = {
        matchId: interaction.options.getString("matchid"),
        stages: interaction.options.getString("stages"),
        player1: interaction.options.getString("player1"),
        player2: interaction.options.getString("player2"),
        score1: interaction.options.getString("score1"),
        score2: interaction.options.getString("score2"),
        mplink: interaction.options.getString("mplink"),
        bans: {
            ban1: interaction.options.getString("ban1"),
            ban2: interaction.options.getString("ban2"),
            ban3: interaction.options.getString("ban3"),
            ban4: interaction.options.getString("ban4"),
        },
        firstpick: interaction.options.getString("firstpick"),
        firstban: interaction.options.getString("firstban"),
        referee: interaction.options.getString("referee") || '',
    };

    const resultEmbed = new EmbedBuilder()
        .setAuthor({ name: `${data.stages}: Match ${data.matchId}` })
        .setTitle(`Final Result`)
        .setThumbnail(iconURL)
        .addFields(
            {
                name: `${p1Profile} ${data.player1} ${data.score1 >= data.score2 ? "👑" : ""}${data.score1 === 0 ? "<:anzucry:1172856722185015316>" : ""}`,
                value: data.score1 > 0 ? "🔴".repeat(data.score1) : "_ _",
                inline: false,
            },
            {
                name: `${p2Profile} ${data.player2} ${data.score2 >= data.score1 ? "👑" : ""}${data.score2 === 0 ? "<:anzucry:1172856722185015316>" : ""}`,
                value: data.score2 > 0 ? "🔵".repeat(data.score2) : "_ _",
                inline: false,
            },
            { name: "MP LINK", value: `https://osu.ppy.sh/mp/${data.mplink}`, inline: false },
            { name: "Picks/Bans", value: `First Pick: ${data.firstpick}\nFirst Ban: ${data.firstban}`, inline: false },
            {
                name: "Bans",
                value: `${data.player1}:\n${data.bans.ban1}\n${data.bans.ban2}\n\n${data.player2}:\n${data.bans.ban3}\n${data.bans.ban4}`,
                inline: false,
            }
        )
        .setFooter({ text: `Referee: ${data.referee} • ${TOURNAMENT_NAME}` })
        .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });
    await interaction.reply({ content: `Match ${data.matchId} submitted successfully!` });
    await Promise.all([p1Profile, p2Profile].map(emoji => emoji.delete()));

}

module.exports = { data, execute };
export { };