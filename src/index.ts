const { GoogleSpreadsheet } = require("google-spreadsheet");
const { Message } = require("discord.js");
require("dotenv").config();
const { DISCORD_TOKEN } = process.env;
const Util = require('util');
const { Client, GatewayIntentBits, MessageFlags, Partials, ActivityType } = require("discord.js");
const commandHandler = require("./handler/commandHandler");
const statsUtil = require('./stats/stats_util.js');
const formula = require('./stats/formula.js');
const util = require('./stats/util.js');
const { getDoc,loadDoc } = require("./handler/googleSheetAuth");

function handleError(err: unknown): string {
    return err instanceof Error ? err.stack || err.message : 'I Don\'t know what happened as well';
}
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
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

client.on('messageCreate', async (msg: typeof Message) => {
    try {
        if (msg.author.id !== "365086070754246657") return;
        const args = msg.content.split(' ');

        if (!new RegExp(`^<@!?${client.user.id}>`).test(args.shift())) return;
        switch (args.shift().toLowerCase()) {
            default: break;
            case 'eval': {
                try {
                    const code = args.join(' ').replace(/^```(?:[^\n]*\n)?([^]+)```$/, (found: string, code: string) => code);
                    const returned = await eval(`(async () => {\n${code}\n})`)();
                    await msg.channel.send('```js\n' + Util.inspect(returned).substring(0, 2000 - 10) + '\n```');
                } catch (err: any) {
                    await msg.channel.send('```js\n' + err.stack.substring(0, 2000 - 10) + '\n```');
                }
            } break;
            case 'stats': {
                const doc = await loadDoc(args.shift());
                await statsUtil.supdate(doc, msg);
            } break;
        }
    } catch (err: any) {
        await msg.channel.send(`${'```'}js\n${err.stack}\n${'```'}`);
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

