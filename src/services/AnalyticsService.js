const crypto = require("node:crypto");

class AnalyticsService {
    constructor(client) { this.client = client; }

    range(options = {}) {
        const now = Number(options.now) || Date.now();
        const days = Math.min(Math.max(Number(options.days) || 30, 1), 365);
        const endMs = options.endMs ? Number(options.endMs) : now;
        const startMs = options.startMs ? Number(options.startMs) : endMs - days * 86400000;
        const duration = Math.max(endMs - startMs, 86400000);
        return { startMs, endMs, startSeconds: Math.floor(startMs / 1000), endSeconds: Math.floor(endMs / 1000),
            previousStartSeconds: Math.floor((startMs - duration) / 1000), previousEndSeconds: Math.floor(startMs / 1000), days: Math.ceil(duration / 86400000) };
    }

    async period(guildId, startSeconds, endSeconds) {
        const summary = await this.client.database.get(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
            AVG(CASE WHEN success = 1 AND verification_duration > 0 THEN verification_duration END) AS average_duration,
            AVG(CASE WHEN attempts > 0 THEN attempts END) AS average_attempts
            FROM verification_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp < ?`, [guildId, startSeconds, endSeconds]);
        const total = Number(summary?.total) || 0;
        const successes = Number(summary?.successes) || 0;
        return { total, successes, failures: Number(summary?.failures) || 0,
            successRate: total ? Number((successes / total * 100).toFixed(1)) : 0,
            averageDuration: summary?.average_duration == null ? null : Number(Number(summary.average_duration).toFixed(1)),
            averageAttempts: summary?.average_attempts == null ? null : Number(Number(summary.average_attempts).toFixed(2)) };
    }

    change(current, previous) {
        if (!previous) return current ? 100 : 0;
        return Number(((current - previous) / previous * 100).toFixed(1));
    }

    async generate(guildId, options = {}) {
        const range = this.range(options);
        const [current, previous, daily, failures, securityEvents, onboarding] = await Promise.all([
            this.period(guildId, range.startSeconds, range.endSeconds),
            this.period(guildId, range.previousStartSeconds, range.previousEndSeconds),
            this.client.database.all(`SELECT date(timestamp, 'unixepoch') AS day,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures
                FROM verification_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp < ? GROUP BY day ORDER BY day`,
            [guildId, range.startSeconds, range.endSeconds]),
            this.client.database.all(`SELECT COALESCE(failure_reason, 'Unknown') AS reason, COUNT(*) AS count
                FROM verification_logs WHERE guild_id = ? AND success = 0 AND timestamp >= ? AND timestamp < ?
                GROUP BY failure_reason ORDER BY count DESC LIMIT 10`, [guildId, range.startSeconds, range.endSeconds]),
            this.client.database.all("SELECT type, timestamp FROM security_events WHERE guild_id = ? AND timestamp >= ? AND timestamp < ? ORDER BY timestamp",
                [guildId, range.startMs, range.endMs]),
            this.client.database.get(`SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failures,
                SUM(CASE WHEN acknowledged_at > 0 THEN 1 ELSE 0 END) AS acknowledged
                FROM onboarding_deliveries WHERE guild_id = ? AND created_at >= ? AND created_at < ?`, [guildId, range.startMs, range.endMs])
        ]);
        const count = prefix => securityEvents.filter(event => event.type.startsWith(prefix)).length;
        return { guildId, range, current, previous,
            comparison: { total: this.change(current.total, previous.total), successRate: Number((current.successRate - previous.successRate).toFixed(1)), failures: this.change(current.failures, previous.failures) },
            daily, failures, raidAlerts: count("JOIN_VELOCITY"), accountRisk: securityEvents.filter(event => event.type.includes("ACCOUNT") || event.type.includes("HIGH_ALERT_BLOCK")).length,
            trusted: count("TRUST_POLICY_BYPASS"), manual: count("MANUAL_"), reverifications: count("REVERIFICATION_ENFORCED"),
            onboarding: { total: Number(onboarding?.total) || 0, failures: Number(onboarding?.failures) || 0, acknowledged: Number(onboarding?.acknowledged) || 0 },
            generatedAt: Date.now() };
    }

    anonymize(guildId, userId) { return crypto.createHash("sha256").update(`${guildId}:${userId}`).digest("hex").slice(0, 12); }

    async exportRows(guildId, range, privacySafe = true) {
        const rows = await this.client.database.all(`SELECT user_id, success, failure_reason, timestamp, attempts, verification_duration
            FROM verification_logs WHERE guild_id = ? AND timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC LIMIT 50000`,
        [guildId, range.startSeconds, range.endSeconds]);
        return rows.map(row => ({ user: privacySafe ? this.anonymize(guildId, row.user_id) : row.user_id,
            result: Number(row.success) === 1 ? "SUCCESS" : "FAILED", reason: row.failure_reason || "",
            timestamp: new Date(Number(row.timestamp) * 1000).toISOString(), attempts: row.attempts || "", durationSeconds: row.verification_duration || "" }));
    }
}

module.exports = AnalyticsService;
