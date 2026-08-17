const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 3, deferReply: true,
    permissions: [PermissionFlagsBits.ManageRoles], botPermissions: [PermissionFlagsBits.ManageRoles],
    data: new SlashCommandBuilder().setName("unverify").setDescription("Remove a member's verified role.")
        .addUserOption(option => option.setName("user").setDescription("Member to unverify.").setRequired(true))
        .addBooleanOption(option => option.setName("confirm").setDescription("Confirm removal of the verified role.").setRequired(true))
        .addStringOption(option => option.setName("note").setDescription("Optional moderator note.").setMaxLength(250)),
    async execute(interaction, client) {
        if (!interaction.options.getBoolean("confirm")) return ResponseHandler.warning(interaction, "No changes were made because confirmation was not provided.");
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        const result = await ModerationService.unverify(client, member, interaction.user.id, interaction.options.getString("note"));
        return result.changed ? ResponseHandler.success(interaction, `${user} is no longer verified.`) : ResponseHandler.info(interaction, `${user} was not verified.`);
    }
});
