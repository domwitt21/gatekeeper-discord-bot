const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const VerificationManager = require("../../managers/VerificationManager");

module.exports = CommandBuilder.create({
    category: "admin",
    cooldown: 10,
    deferReply: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    botPermissions: [PermissionFlagsBits.ManageMessages],
    data: new SlashCommandBuilder()
        .setName("removeverify")
        .setDescription("Remove Gatekeeper verification from this server."),
    async execute(interaction, client) {
        const settings = await client.database.guilds.getSettings(interaction.guild.id);
        if (!settings) return ResponseHandler.warning(interaction, "Verification is not configured for this server.");
        await VerificationManager.removeExistingVerification(client, settings);
        await client.database.guilds.removeSettings(interaction.guild.id);
        await client.database.run("DELETE FROM captchas WHERE guild_id = ?", [interaction.guild.id]);
        await client.database.run("DELETE FROM trust_policies WHERE guild_id = ?", [interaction.guild.id]);
        await client.database.run("DELETE FROM report_deliveries WHERE guild_id = ?", [interaction.guild.id]);
        await client.database.run("DELETE FROM member_verifications WHERE guild_id = ?", [interaction.guild.id]);
        return ResponseHandler.success(interaction, "Verification configuration and active challenges were removed.");
    }
});
