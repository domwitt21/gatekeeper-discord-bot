const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 5, deferReply: true,
    permissions: [PermissionFlagsBits.ManageRoles], botPermissions: [PermissionFlagsBits.ManageRoles],
    data: new SlashCommandBuilder().setName("reverify-user").setDescription("Require a member to complete verification again.")
        .addUserOption(option => option.setName("user").setDescription("Member to reverify.").setRequired(true))
        .addBooleanOption(option => option.setName("confirm").setDescription("Confirm removal of current verification.").setRequired(true))
        .addStringOption(option => option.setName("note").setDescription("Optional moderator note.").setMaxLength(250)),
    async execute(interaction, client) {
        if (!interaction.options.getBoolean("confirm")) return ResponseHandler.warning(interaction, "No changes were made because confirmation was not provided.");
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        await ModerationService.requireReverification(client, member, interaction.user.id, interaction.options.getString("note"));
        return ResponseHandler.success(interaction, `${user} must complete verification again.`);
    }
});
