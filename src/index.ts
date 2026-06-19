require("dotenv").config();
const { DISCORD_TOKEN } = process.env;
const { Client, GatewayIntentBits, Partials, ActivityType } = require("discord.js");
const commandHandler = require("./handler/commandHandler");
import { registerOwnerCommands } from './handler/PingCommandHandler';


function handleError(err: unknown): string {
    return err instanceof Error ? err.stack || err.message : 'I Don\'t know what happened as well';
}
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.User,
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction
    ],
    presence: {
        activities: [{
            name: '鷺澤有里栖 a(✿◠‿◠)',
            type: ActivityType.Streaming,
            url: 'https://www.youtube.com/watch?v=0976Z1s0V1A&ab_channel=CircusOfficialChannel'
        }]
    }
});

commandHandler(client);
registerOwnerCommands(client);

client.on("interactionCreate", async (interaction: any) => {
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

