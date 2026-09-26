import "dotenv/config";
import { REST, Routes } from "discord.js";
import { findCommandFiles } from "./handler/commandHandler";

const GUILD_IDS = ["905398607895752735", "1457804754720919565"];
const DISCORD_TOKEN_DEPLOY = process.env.DISCORD_TOKEN!;
const CLIENT_ID_DEPLOY = process.env.CLIENT_ID!;

const commands: unknown[] = [];

for (const filePath of findCommandFiles()) {
    const command = require(filePath);
    if ("data" in command) {
        commands.push(command.data.toJSON());
    } else {
        console.warn(`The command at ${filePath} is missing a "data" property.`);
    }
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN_DEPLOY);

(async () => {
    try {
        console.log("Clearing global application (/) commands to prevent overlapping...");

        await rest.put(Routes.applicationCommands(CLIENT_ID_DEPLOY), { body: [] });
        console.log("Successfully cleared global commands.");

        console.log("Started refreshing guild-specific application (/) commands.");

        for (const guildId of GUILD_IDS) {
            console.log(`Deploying to Guild ID: ${guildId}...`);
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID_DEPLOY, guildId), { body: commands });
            console.log(`Successfully reloaded commands for Guild ID: ${guildId}.`);
        }

        console.log("Finished deploying to all provided Guilds.");
    } catch (error) {
        console.error(error);
    }
})();
