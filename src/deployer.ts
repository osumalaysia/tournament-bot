const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const DISCORD_TOKEN_DEPLOY = process.env.DISCORD_TOKEN;
const CLIENT_ID_DEPLOY = process.env.CLIENT_ID;
const GUILD_ID_DEPLOY = process.env.GUILD_ID;

const commands: any[] = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((file:any) => file.endsWith(".js") || file.endsWith(".ts"));

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if ("data" in command) {
        commands.push(command.data.toJSON());
    } else {
        console.warn(`The command at ${file} is missing a "data" property.`);
    }
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN_DEPLOY);

(async () => {
    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(Routes.applicationGuildCommands(CLIENT_ID_DEPLOY, GUILD_ID_DEPLOY),  { body: commands });


        console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
        console.error(error);
    }
})();

export {};