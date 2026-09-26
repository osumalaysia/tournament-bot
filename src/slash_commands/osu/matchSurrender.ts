import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { TOURNAMENT } from "../../config";
import { ensureReferee, postResult, withProfileEmojis } from "../../utils/tournament";

const REQUIRED_OPTIONS: Array<[name: string, description: string]> = [
    ["matchid", "Match ID from the schedule sheet tab"],
    ["stages", "Stages of the match"],
    ["forfeit_player", "Player 1"],
    ["winner_player", "Player 2"],
    ["player1seed", "Player 1 Seed"],
    ["player2seed", "Player 2 Seed"],
    ["forfeit_id", "Player 1 ID"],
    ["winner_id", "Player 2 ID"],
];

export const data = new SlashCommandBuilder().setName("forfeit").setDescription("output result");
for (const [name, description] of REQUIRED_OPTIONS) {
    data.addStringOption((option) => option.setName(name).setDescription(description).setRequired(true));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!(await ensureReferee(interaction))) return;

    const get = (name: string) => interaction.options.getString(name, true);
    const matchId = get("matchid");

    await withProfileEmojis(interaction, [get("forfeit_id"), get("winner_id")], async ([forfeitProfile, winnerProfile]) => {
        const resultEmbed = new EmbedBuilder()
            .setAuthor({ name: `${get("stages")}: Match ${matchId}` })
            .setTitle(`Win by Default for ${get("winner_player")} #${get("player2seed")} ${winnerProfile}`)
            .setDescription(`**${get("forfeit_player")}** #${get("player1seed")} ${forfeitProfile} has forfeited the match.`)
            .setFooter({ text: TOURNAMENT.NAME })
            .setTimestamp();

        await postResult(interaction, matchId, resultEmbed);
    });
}
