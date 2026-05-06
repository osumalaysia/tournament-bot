import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember, Role, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("add-roles")
    .setDescription("Add roles to a batch of users by their Discord IDs")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addRoleOption(option => 
        option.setName("role")
            .setDescription("The role to add (mention it or type the name)")
            .setRequired(true)
    )
    .addStringOption(option => 
        option.setName("ids")
            .setDescription("Comma separated list of Discord IDs")
            .setRequired(true)
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const roleObj = interaction.options.getRole("role") as Role;
    const rawIds = interaction.options.getString("ids") ?? "";
    const ids = rawIds.split(",").map(id => id.trim()).filter(id => id.length > 0);
    const guild = interaction.guild;

    if (!guild) {
        await interaction.reply({ content: "This must be used in a server.", ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: false });

    const success: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
        try {
            const member = await guild.members.fetch(id);
            await member.roles.add(roleObj);
            success.push(`${member.user.tag} (\`${id}\`)`);
        } catch (error: any) {
            console.error(`Failed to add role for ID ${id}:`, error);
            failed.push(id);
        }
    }

    let responseMessage = `### Results for adding ${roleObj.name}:\n`;
    
    if (success.length > 0) {
        responseMessage += `**✅ Added to:**\n${success.join("\n")}\n`;
    }
    
    if (failed.length > 0) {
        responseMessage += `**❌ Failed for IDs (Check if they are in the server):**\n${failed.join(", ")}`;
    }

    if (responseMessage.length > 2000) {
        await interaction.editReply({ content: "Role added, but the list of users is too long to display here." });
    } else {
        await interaction.editReply({ content: responseMessage });
    }
}

module.exports = { data, execute };

