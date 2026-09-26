import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { TOURNAMENT } from "../../config";
import { ensureReferee, postResult, withProfileEmojis } from "../../utils/tournament";

const ANZU_CRY = "<:anzucry:1172856722185015316>";

const REQUIRED_OPTIONS: Array<[name: string, description: string]> = [
    ["matchid", "Match ID from the schedule sheet tab"],
    ["stages", "Stages of the match"],
    ["player1", "Player 1"],
    ["player2", "Player 2"],
    ["player1seed", "Player 1 Seed"],
    ["player2seed", "Player 2 Seed"],
    ["player1id", "Player 1 ID"],
    ["player2id", "Player 2 ID"],
    ["score1", "Score of Player 1"],
    ["score2", "Score of Player 2"],
    ["mplink", "Multiplayer link"],
    ["ban1", "Ban 1"],
    ["ban2", "Ban 2"],
    ["ban3", "Ban 3"],
    ["ban4", "Ban 4"],
    ["firstpick", "First Pick"],
    ["firstban", "First Ban"],
];

export const data = new SlashCommandBuilder().setName("result").setDescription("output result");
for (const [name, description] of REQUIRED_OPTIONS) {
    data.addStringOption((option) => option.setName(name).setDescription(description).setRequired(true));
}
data.addStringOption((option) => option.setName("referee").setDescription("Other Notes").setRequired(false));

function scoreBadges(ownScore: number, otherScore: number): string {
    return `${ownScore >= otherScore ? "👑" : ""}${ownScore === 0 ? ANZU_CRY : ""}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await ensureReferee(interaction))) return;

    const get = (name: string) => interaction.options.getString(name, true);
    const matchId = get("matchid");
    const [player1, player2] = [get("player1"), get("player2")];
    const [score1, score2] = [Number(get("score1")), Number(get("score2"))];
    const referee = interaction.options.getString("referee") ?? "";

    await withProfileEmojis(interaction, [get("player1id"), get("player2id")], async ([p1Profile, p2Profile]) => {
        const resultEmbed = new EmbedBuilder()
            .setAuthor({ name: `${get("stages")}: Match ${matchId}` })
            .setTitle(`${scoreBadges(score1, score2)} ${player1} #${get("player1seed")} ${p1Profile} | ${score1} - ${score2} | ${p2Profile} #${get("player2seed")} ${player2} ${scoreBadges(score2, score1)}`)
            .addFields(
                { name: "MP LINK", value: `https://osu.ppy.sh/mp/${get("mplink")}`, inline: false },
                { name: "Picks/Bans", value: `First Pick: ${get("firstpick")}\nFirst Ban: ${get("firstban")}`, inline: false },
                {
                    name: "Bans",
                    value: `**​${player1}:**\n${get("ban1")}\n${get("ban3")}\n\n**​${player2}:**\n${get("ban2")}\n${get("ban4")}`,
                    inline: false,
                },
            )
            .setFooter({ text: `Referee: ${referee} • ${TOURNAMENT.NAME}` })
            .setTimestamp();

        await postResult(interaction, matchId, resultEmbed);
    });
}
