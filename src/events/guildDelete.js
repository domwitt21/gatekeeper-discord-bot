const { Events } = require("discord.js");

module.exports = {
    name: Events.GuildDelete,
    async execute(guild, client) {
        await Promise.all([
            client.database.guilds.removeSettings(guild.id),
            client.database.run("DELETE FROM captchas WHERE guild_id = ?", [guild.id]),
            client.database.run("DELETE FROM verification_logs WHERE guild_id = ?", [guild.id])
        ]);
        console.log(`Removed data for guild: ${guild.name} (${guild.id})`);
    }
};
