const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("reload")
        .setDescription("Reload the bot (coming soon)."),

    async execute(interaction) {
        await interaction.reply({
            content: "🚧 This command is still under development.",
            ephemeral: true
        });
    }
};