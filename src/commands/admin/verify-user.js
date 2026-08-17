const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 3, deferReply: true,
    permissions: [PermissionFlagsBits.ManageRoles], botPermissions: [PermissionFlagsBits.ManageRoles],
    data: new SlashCommandBuilder().setName("verify-user").setDescription("Manually verify a server member.")
        .addUserOption(option => option.setName("user").setDescription("Member to verify.").setRequired(true))
        .addStringOption(option => option.setName("note").setDescription("Optional moderator note.").setMaxLength(250)),
    async execute(interaction, client) {
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        await ModerationService.verify(client, member, interaction.user.id, interaction.options.getString("note"));
        return ResponseHandler.success(interaction, `${user} has been manually verified.`);
    }
});
