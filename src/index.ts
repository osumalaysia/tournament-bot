import "dotenv/config";
import { Client, GatewayIntentBits, Partials, ActivityType, MessageFlags } from "discord.js";
import { loadCommands } from "./handler/commandHandler";
import { registerPingCommands } from './handler/PingCommandHandler';
import { startAniListWatcher } from './anilist/watcher';
import { initErrorLogger, logErrorToDiscord } from './utils/errorLogger';
import { ANILIST, CONFIG } from './config';
import { startEmbedBuilder } from "./embedBuilder/embedBuilder";

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
            url: CONFIG.STREAM_URL
        }]
    }
});

const commands = loadCommands();
registerPingCommands(client);
startEmbedBuilder(client);

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        await logErrorToDiscord(`command:${interaction.commandName}`, error);
        const errorReply = { content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral } as const;
        const respond = interaction.replied || interaction.deferred ? interaction.followUp(errorReply) : interaction.reply(errorReply);
        await respond.catch(() => null);
    }
});

process.on("uncaughtException", (error) => {
    logErrorToDiscord("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
    logErrorToDiscord("unhandledRejection", reason);
});

client.on("error", (error: unknown) => {
    logErrorToDiscord("client", error);
});


(async () => {
    try {
        await client.login(process.env.DISCORD_TOKEN);
        console.log("My Wife logged in successfully at " + new Date().toLocaleString());
        initErrorLogger(client);
        startAniListWatcher(client, {
            username: ANILIST.USERNAME,
            channelId: ANILIST.ANIME_CHANNEL_ID,
            intervalMs: ANILIST.CHECK_INTERVAL_MS
        });
    } catch (error) {
        console.error(`Error: ${error}`);
        await logErrorToDiscord("startup", error);
    }
})();

