const EmbedFactory = require("../ui/EmbedFactory");

class JoinVelocityService {
    constructor() { this.joins = new Map(); }

    recordJoin(guildId, settings = {}, now = Date.now()) {
        if (Number(settings.raid_protection_enabled) !== 1) {
            this.joins.delete(guildId);
            return { enabled: false, triggered: false, active: false, count: 0 };
        }
        const threshold = this.integer(settings.join_velocity_threshold, 3, 100, 10);
        const windowSeconds = this.integer(settings.join_velocity_window_seconds, 10, 600, 60);
        const highAlertMinutes = this.integer(settings.high_alert_minutes, 1, 120, 10);
        const cutoff = now - windowSeconds * 1000;
        const recent = (this.joins.get(guildId) || []).filter(timestamp => timestamp >= cutoff);
        recent.push(now);
        this.joins.set(guildId, recent);
        const existingUntil = Number(settings.high_alert_until) || 0;
        const alreadyActive = existingUntil > now;
        const triggered = recent.length >= threshold && !alreadyActive;
        const highAlertUntil = triggered ? now + highAlertMinutes * 60000 : existingUntil;
        return { enabled: true, triggered, active: alreadyActive || triggered, count: recent.length,
            threshold, windowSeconds, highAlertMinutes, highAlertUntil };
    }

    integer(value, minimum, maximum, fallback) {
        const parsed = Number.parseInt(value, 10);
        return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
    }

    async handleMemberJoin(member, client, now = Date.now()) {
        const settings = await client.database.guilds.getSettings(member.guild.id);
        const result = this.recordJoin(member.guild.id, settings, now);
        if (!result.triggered) return result;
        await client.database.guilds.setHighAlertUntil(member.guild.id, result.highAlertUntil);
        await client.database.securityEvents.record({ guildId: member.guild.id, type: "JOIN_VELOCITY_ALERT",
            details: `${result.count} joins within ${result.windowSeconds} seconds`, timestamp: now });
        if (settings?.log_channel_id) {
            try {
                const channel = await member.guild.channels.fetch(settings.log_channel_id);
                if (channel) await channel.send({ embeds: [EmbedFactory.warning("High-Alert Mode Activated",
                    `${result.count} members joined within ${result.windowSeconds} seconds. Gatekeeper will monitor this server in high-alert mode for ${result.highAlertMinutes} minutes. No members were automatically blocked.`)] });
            } catch (error) { console.error("Unable to send join-velocity alert", error); }
        }
        return result;
    }
}

module.exports = JoinVelocityService;
