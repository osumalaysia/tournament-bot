const guilds = ["905398607895752735", "1457804754720919565"];
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const DISCORD_TOKEN_DEPLOY = process.env.DISCORD_TOKEN;
const CLIENT_ID_DEPLOY = process.env.CLIENT_ID;
const GUILD_IDS = guilds.length > 0 ? guilds : (process.env.GUILD_ID ? [process.env.GUILD_ID] : []);

const commands: any[] = [];
const commandsPath = path.join(__dirname, "slash_commands");

const getAllFiles = (dirPath: string): string[] => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    return entries.flatMap((entry: any) => {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            return getAllFiles(fullPath);
        }

        const isValid = (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) && !entry.name.endsWith(".d.ts");
        return isValid ? [fullPath] : [];
    });
};

const commandFiles = getAllFiles(commandsPath);

for (const filePath of commandFiles) {
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

        if (GUILD_IDS.length === 0) {
            console.warn("No Guild IDs found. Please set GUILD_IDS or GUILD_ID in your .env file.");
            return;
        }

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

export {};