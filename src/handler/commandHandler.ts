import * as fs from "fs";
import * as path from "path";
import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export interface SlashCommand {
    data: Pick<SlashCommandBuilder, "name" | "toJSON">;
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}

export const SLASH_COMMANDS_DIR = path.join(__dirname, "../slash_commands");

export function findCommandFiles(dirPath: string = SLASH_COMMANDS_DIR): string[] {
    return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) return findCommandFiles(fullPath);

        const isValid = (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) && !entry.name.endsWith(".d.ts");
        return isValid ? [fullPath] : [];
    });
}

export function loadCommands(): Map<string, SlashCommand> {
    const commands = new Map<string, SlashCommand>();

    for (const filePath of findCommandFiles()) {
        const command = require(filePath);

        if ("data" in command && "execute" in command) {
            commands.set(command.data.name, command);
            console.log(`Loaded command: ${command.data.name}`);
        } else {
            console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
    return commands;
}
