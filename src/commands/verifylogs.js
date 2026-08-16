const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../builders/CommandBuilder");
const EmbedFactory = require("../ui/EmbedFactory");
const ResponseHandler = require("../handlers/ResponseHandler");

module.exports = CommandBuilder.create({
    category: "admin",
    cooldown: 5,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder()
        .setName("verifylogs")
        .setDescription("View recent verification activity.")
        .addIntegerOption(option => option.setName("limit").setDescription("Number of entries to show (1-20).").setMinValue(1).setMaxValue(20)),
    async execute(interaction, client) {
        const limit = interaction.options.getInteger("limit") || 10;
        const rows = await client.database.logs.getRecent(interaction.guild.id, limit);
        const description = rows.length
            ? rows.map(row => {
                const result = Number(row.success) === 1 ? "✅" : "❌";
                const timestamp = row.timestamp < 1e12 ? row.timestamp : Math.floor(row.timestamp / 1000);
                const reason = row.failure_reason ? ` — ${String(row.failure_reason).slice(0, 80)}` : "";
                return `${result} <@${row.user_id}> <t:${timestamp}:R>${reason}`;
            }).join("\n").slice(0, 4000)
            : "No verification attempts have been recorded.";
        const embed = EmbedFactory.create({ title: "Recent verification activity", description });
        return ResponseHandler.reply(interaction, { embeds: [embed], ephemeral: true });
    }
});
