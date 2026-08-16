const { Events } = require("discord.js");
const JoinVelocityService = require("../services/JoinVelocityService");

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        try {
            if (!client.joinVelocityService) client.joinVelocityService = new JoinVelocityService();
            await client.joinVelocityService.handleMemberJoin(member, client);
        } catch (error) {
            console.error("Join-velocity monitor failed", error);
        }
    }
};
