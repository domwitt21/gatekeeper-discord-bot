const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

const expiryOption = option => option.setName("duration-days").setDescription("Optional number of days before this policy expires.").setMinValue(1).setMaxValue(3650).setRequired(false);
const reasonOption = option => option.setName("reason").setDescription("Optional administrator note.").setMaxLength(250).setRequired(false);

module.exports = CommandBuilder.create({
    category: "admin",
    cooldown: 5,
    deferReply: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder()
        .setName("policy")
        .setDescription("Manage SentraGuard trust and deny policies.")
        .addSubcommand(command => command.setName("trust-user").setDescription("Allow a user to bypass CAPTCHA.")
            .addUserOption(option => option.setName("user").setDescription("User to trust.").setRequired(true))
            .addIntegerOption(expiryOption).addStringOption(reasonOption))
        .addSubcommand(command => command.setName("deny-user").setDescription("Prevent a user from verifying.")
            .addUserOption(option => option.setName("user").setDescription("User to deny.").setRequired(true))
            .addIntegerOption(expiryOption).addStringOption(reasonOption))
        .addSubcommand(command => command.setName("trust-role").setDescription("Allow a role to bypass CAPTCHA.")
            .addRoleOption(option => option.setName("role").setDescription("Role to trust.").setRequired(true))
            .addIntegerOption(expiryOption).addStringOption(reasonOption))
        .addSubcommand(command => command.setName("remove-user").setDescription("Remove a user's trust or deny policy.")
            .addUserOption(option => option.setName("user").setDescription("User policy to remove.").setRequired(true)))
        .addSubcommand(command => command.setName("remove-role").setDescription("Remove a trusted-role policy.")
            .addRoleOption(option => option.setName("role").setDescription("Role policy to remove.").setRequired(true))),

    async execute(interaction, client) {
        const subcommand = interaction.options.getSubcommand();
        const subjectType = subcommand.includes("role") ? "ROLE" : "USER";
        const subject = subjectType === "ROLE" ? interaction.options.getRole("role") : interaction.options.getUser("user");
        if (subcommand.startsWith("remove")) {
            await client.database.trustPolicies.remove(interaction.guild.id, subjectType, subject.id);
            await client.database.securityEvents.record({ guildId: interaction.guild.id, type: "TRUST_POLICY_REMOVED",
                details: `${subjectType} ${subject.id} by ${interaction.user.id}` });
            return ResponseHandler.success(interaction, `Removed the policy for ${subject}.`);
        }
        const policy = subcommand === "deny-user" ? "DENY" : "TRUST";
        const durationDays = interaction.options.getInteger("duration-days");
        const expiresAt = durationDays ? Date.now() + durationDays * 86400000 : 0;
        const reason = interaction.options.getString("reason");
        await client.database.trustPolicies.upsert({ guildId: interaction.guild.id, subjectType, subjectId: subject.id,
            policy, reason, expiresAt, createdBy: interaction.user.id });
        if (policy === "DENY") await ModerationService.revokeIfDenied(client, interaction.guild, subject.id, interaction.user.id, reason);
        await client.database.securityEvents.record({ guildId: interaction.guild.id, type: `TRUST_POLICY_${policy}`,
            details: `${subjectType} ${subject.id} by ${interaction.user.id}` });
        return ResponseHandler.success(interaction, `${subject} is now ${policy === "DENY" ? "denied" : "trusted"}${durationDays ? ` for ${durationDays} day(s)` : ""}.`);
    }
});
