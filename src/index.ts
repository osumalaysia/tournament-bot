const { Message } = require("discord.js");
require("dotenv").config();
const { DISCORD_TOKEN } = process.env;
const { Client, GatewayIntentBits, MessageFlags, Partials,} = require("discord.js");
const commandHandler = require("./handler/commandHandler");

function handleError(err: unknown): string {
    return err instanceof Error ? err.stack || err.message : 'I Don\'t know what happened as well';
}
const client = new Client({
    intents: ["Guilds", "GuildMessages", "DirectMessages"],
    partials: `USER,CHANNEL,GUILD_MEMBER,MESSAGE,REACTION`.split(',').map(partial => Partials[partial]),
    presence: {
        activities: [{
            name: '鷺澤有里栖 a(✿◠‿◠)',
            type: 'STREAMING',
            url: 'https://www.youtube.com/watch?v=0976Z1s0V1A&ab_channel=CircusOfficialChannel'
        }]
    }
});

commandHandler(client);

client.on("interactionCreate", async (interaction:any) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing ${interaction.commandName}`);
        console.error(error);
        await interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
        });
    }
});

(async () => {
    try {
        await client.login(DISCORD_TOKEN);
        console.log("Yoru logged in successfully at " + new Date().toLocaleString());
    } catch (error) {
        console.error(`Error: ${error}`);
    }
})();

