const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const SecurityReportService = require("../../services/SecurityReportService");

module.exports = CommandBuilder.create({ category: "admin", cooldown: 10, deferReply: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder().setName("security-report").setDescription("Generate a SentraGuard security report.")
        .addStringOption(option => option.setName("period").setDescription("Reporting period.").setRequired(true)
            .addChoices({ name: "Last 24 hours", value: "DAILY" }, { name: "Last 7 days", value: "WEEKLY" }))
        .addBooleanOption(option => option.setName("deliver-to-channel").setDescription("Also send the report to the configured report channel.")),
    async execute(interaction, client) {
        const period = interaction.options.getString("period");
        const settings = await client.database.guilds.getSettings(interaction.guild.id);
        const service = client.securityReportService || new SecurityReportService(client);
        if (interaction.options.getBoolean("deliver-to-channel")) {
            await service.deliver(interaction.guild, settings, period, "ON_DEMAND_REPORT");
            return ResponseHandler.success(interaction, "The report was delivered to the configured report channel.");
        }
        const report = await service.generate(interaction.guild.id, period);
        await client.database.reportDeliveries.record({ guildId: interaction.guild.id, deliveryType: "ON_DEMAND_PREVIEW",
            period, channelId: interaction.channelId, success: true, attempts: 1 });
        return ResponseHandler.reply(interaction, { embeds: [service.createEmbed(report)], ephemeral: true });
    }
});
