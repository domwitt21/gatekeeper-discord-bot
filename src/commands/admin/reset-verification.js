const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 3, deferReply: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder().setName("reset-verification").setDescription("Clear a member's active challenge, cooldown, and lockout.")
        .addUserOption(option => option.setName("user").setDescription("Member to reset.").setRequired(true))
        .addBooleanOption(option => option.setName("confirm").setDescription("Confirm reset of verification state.").setRequired(true))
        .addStringOption(option => option.setName("note").setDescription("Optional moderator note.").setMaxLength(250)),
    async execute(interaction, client) {
        if (!interaction.options.getBoolean("confirm")) return ResponseHandler.warning(interaction, "No changes were made because confirmation was not provided.");
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        await ModerationService.reset(client, member, interaction.user.id, interaction.options.getString("note"));
        return ResponseHandler.success(interaction, `Cleared ${user}'s verification challenge, cooldown, and lockout.`);
    }
});
