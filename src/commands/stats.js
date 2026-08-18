const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const CommandBuilder = require("../builders/CommandBuilder");
const EmbedFactory = require("../ui/EmbedFactory");
const ResponseHandler = require("../handlers/ResponseHandler");

module.exports = CommandBuilder.create({
    category: "admin",
    cooldown: 5,
    permissions: [PermissionFlagsBits.ManageGuild],
    data: new SlashCommandBuilder()
        .setName("stats")
        .setDescription("View this server's verification statistics."),
    async execute(interaction, client) {
        const guildId = interaction.guild.id;
        const [successes, failures, active] = await Promise.all([
            client.database.logs.getSuccessCount(guildId),
            client.database.logs.getFailureCount(guildId),
            client.database.captchas.getAll()
        ]);
        const total = successes + failures;
        const rate = total ? ((successes / total) * 100).toFixed(1) : "0.0";
        const embed = EmbedFactory.create({
            title: "SentraGuard verification statistics",
            fields: [
                { name: "Successful", value: String(successes), inline: true },
                { name: "Failed", value: String(failures), inline: true },
                { name: "Success rate", value: `${rate}%`, inline: true },
                { name: "Active challenges", value: String(active.filter(row => row.guild_id === guildId).length), inline: true },
                { name: "Total attempts", value: String(total), inline: true }
            ]
        });
        return ResponseHandler.reply(interaction, { embeds: [embed], ephemeral: true });
    }
});
