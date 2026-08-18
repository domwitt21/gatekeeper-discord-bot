const EmbedFactory = require("../ui/EmbedFactory");

class SecurityReportService {
    constructor(client) {
        this.client = client;
        this.timer = null;
        this.running = false;
    }

    async generate(guildId, period = "WEEKLY", now = Date.now()) {
        const days = period === "DAILY" ? 1 : period === "MONTHLY" ? 30 : 7;
        const verificationSince = Math.floor((now - days * 86400000) / 1000);
        const securitySince = now - days * 86400000;
        const verification = await this.client.database.get(`SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures
            FROM verification_logs WHERE guild_id = ? AND timestamp >= ?`, [guildId, verificationSince]);
        const events = await this.client.database.all("SELECT type FROM security_events WHERE guild_id = ? AND timestamp >= ?", [guildId, securitySince]);
        const total = Number(verification?.total) || 0;
        const successes = Number(verification?.successes) || 0;
        const failures = Number(verification?.failures) || 0;
        const count = prefix => events.filter(event => event.type.startsWith(prefix)).length;
        return { period, days, total, successes, failures,
            successRate: total ? Number((successes / total * 100).toFixed(1)) : 0,
            raidAlerts: count("JOIN_VELOCITY"), denials: events.filter(event => event.type.includes("DENY") || event.type.includes("BLOCK")).length,
            manualActions: count("MANUAL_") + count("VERIFICATION_RESET"), generatedAt: now };
    }

    createEmbed(report) {
        return EmbedFactory.create({ title: `${report.period === "DAILY" ? "Daily" : report.period === "MONTHLY" ? "Monthly" : "Weekly"} Security Report`,
            description: `SentraGuard activity for the last ${report.days} day(s).`,
            fields: [
                { name: "Verification attempts", value: String(report.total), inline: true },
                { name: "Successful", value: String(report.successes), inline: true },
                { name: "Failed", value: String(report.failures), inline: true },
                { name: "Success rate", value: `${report.successRate}%`, inline: true },
                { name: "Raid alerts", value: String(report.raidAlerts), inline: true },
                { name: "Denials / blocks", value: String(report.denials), inline: true },
                { name: "Manual actions", value: String(report.manualActions), inline: true }
            ] });
    }

    async deliver(guild, settings, period, deliveryType = "SCHEDULED_REPORT") {
        const channelId = settings.report_channel_id || settings.log_channel_id;
        if (!channelId) throw new Error("No report or log channel is configured.");
        const report = await this.generate(guild.id, period);
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const channel = await guild.channels.fetch(channelId);
                if (!channel?.isTextBased()) throw new Error("The report channel is unavailable.");
                await channel.send({ embeds: [this.createEmbed(report)] });
                await this.client.database.reportDeliveries.record({ guildId: guild.id, deliveryType, period, channelId, success: true, attempts: attempt });
                await this.client.database.guilds.setLastReportAt(guild.id, Date.now());
                return report;
            } catch (error) {
                lastError = error;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
        await this.client.database.reportDeliveries.record({ guildId: guild.id, deliveryType, period, channelId, success: false, attempts: 3, error: lastError?.message });
        throw lastError;
    }

    severityAllowed(settings, severity) {
        const levels = { INFO: 0, WARNING: 1, CRITICAL: 2 };
        return levels[severity] >= (levels[settings.minimum_alert_severity] ?? 1);
    }

    async deliverAlert(guild, settings, alert) {
        const severity = alert.severity || "WARNING";
        if (!this.severityAllowed(settings, severity)) return { skipped: true };
        if (severity !== "CRITICAL" && this.inQuietHours(settings)) return { skipped: true };
        const channelId = settings.report_channel_id || settings.log_channel_id;
        if (!channelId) return { skipped: true };
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const channel = await guild.channels.fetch(channelId);
                if (!channel?.isTextBased()) throw new Error("The alert channel is unavailable.");
                const embed = severity === "CRITICAL" ? EmbedFactory.error(alert.title, alert.description) : EmbedFactory.warning(alert.title, alert.description);
                await channel.send({ embeds: [embed] });
                await this.client.database.reportDeliveries.record({ guildId: guild.id, deliveryType: `ALERT_${severity}`, channelId, success: true, attempts: attempt });
                return { delivered: true };
            } catch (error) {
                lastError = error;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            }
        }
        await this.client.database.reportDeliveries.record({ guildId: guild.id, deliveryType: `ALERT_${severity}`, channelId, success: false, attempts: 3, error: lastError?.message });
        throw lastError;
    }

    inQuietHours(settings, date = new Date()) {
        const start = Number(settings.quiet_hours_start_utc) || 0;
        const end = Number(settings.quiet_hours_end_utc) || 0;
        if (start === end) return false;
        const hour = date.getUTCHours();
        return start < end ? hour >= start && hour < end : hour >= start || hour < end;
    }

    isDue(settings, now = new Date()) {
        if (Number(settings.scheduled_reports_enabled) !== 1 || this.inQuietHours(settings, now)) return false;
        if (now.getUTCHours() !== Number(settings.report_hour_utc)) return false;
        const frequency = ["DAILY", "MONTHLY"].includes(settings.report_frequency) ? settings.report_frequency : "WEEKLY";
        if (frequency === "WEEKLY" && now.getUTCDay() !== Number(settings.report_weekday)) return false;
        if (frequency === "MONTHLY" && now.getUTCDate() !== 1) return false;
        const elapsed = now.getTime() - (Number(settings.last_report_at) || 0);
        return elapsed >= (frequency === "DAILY" ? 20 : frequency === "MONTHLY" ? 27 * 24 : 6 * 24) * 3600000;
    }

    async tick(now = new Date()) {
        if (this.running) return;
        this.running = true;
        try {
            const settingsList = await this.client.database.guilds.getAllSettings();
            for (const settings of settingsList) {
                if (!this.isDue(settings, now)) continue;
                const guild = this.client.guilds.cache.get(settings.guild_id);
                if (!guild) continue;
                await this.deliver(guild, settings, settings.report_frequency).catch(error => console.error(`Scheduled report failed for ${guild.id}`, error));
            }
        } finally { this.running = false; }
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick().catch(error => console.error("Report scheduler failed", error)), 60000);
        this.timer.unref();
        this.tick().catch(error => console.error("Initial report scheduler check failed", error));
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = SecurityReportService;
