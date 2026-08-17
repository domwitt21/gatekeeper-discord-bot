const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const ModerationService = require("../../services/ModerationService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 2, deferReply: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder().setName("verification-status").setDescription("Inspect a member's verification state.")
        .addUserOption(option => option.setName("user").setDescription("Member to inspect.").setRequired(true)),
    async execute(interaction, client) {
        const user = interaction.options.getUser("user");
        const member = await interaction.guild.members.fetch(user.id);
        const status = await ModerationService.status(client, member);
        const lines = [`Verified: ${status.verified ? "Yes" : "No"}`, `Active challenge: ${status.activeChallenge ? "Yes" : "No"}`,
            `Locked: ${status.lockedUntil > Date.now() ? `Until <t:${Math.floor(status.lockedUntil / 1000)}:R>` : "No"}`,
            `Answer cooldown: ${status.cooldownUntil > Date.now() ? `Until <t:${Math.floor(status.cooldownUntil / 1000)}:R>` : "No"}`,
            `Trust policy: ${status.policyAction}${status.policySource ? ` (${status.policySource})` : ""}`];
        lines.push(`Verification version: ${status.verificationRecord?.policy_version ?? "None"}`,
            `Reverification required: ${status.needsReverification ? "Yes" : "No"}`);
        return ResponseHandler.info(interaction, `${user}\n${lines.join("\n")}`);
    }
});
