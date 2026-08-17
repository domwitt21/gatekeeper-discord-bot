const BaseRepository = require("./BaseRepository");

class ReportDeliveryRepository extends BaseRepository {
    record(entry) {
        this.ensureConnected();
        return this.run(`INSERT INTO report_deliveries
            (guild_id, delivery_type, period, channel_id, success, attempts, error, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [entry.guildId, entry.deliveryType, entry.period ?? null,
            entry.channelId ?? null, entry.success ? 1 : 0, entry.attempts ?? 1,
            entry.error ? String(entry.error).slice(0, 500) : null, entry.timestamp ?? Date.now()]);
    }

    recent(guildId, limit = 20) {
        this.ensureConnected();
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
        return this.list("SELECT * FROM report_deliveries WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?", [guildId, safeLimit]);
    }
}

module.exports = ReportDeliveryRepository;
