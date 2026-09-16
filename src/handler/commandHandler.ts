const fs = require("fs");
const path = require("path");

module.exports = (client: any) => {
    client.commands = new Map();

    const commandsPath = path.join(__dirname, "../slash_commands");

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
        let command = require(filePath);

        if (command.default) command = command.default;

        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
            console.log(`Loaded command: ${command.data.name}`);
        } else {
            console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
};

export { };