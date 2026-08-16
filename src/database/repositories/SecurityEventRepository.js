const BaseRepository = require("./BaseRepository");

class SecurityEventRepository extends BaseRepository {
    record(event) {
        this.ensureConnected();
        return this.run("INSERT INTO security_events (guild_id, type, details, timestamp) VALUES (?, ?, ?, ?)",
            [event.guildId, event.type, event.details ?? null, event.timestamp ?? Date.now()]);
    }

    recent(guildId, limit = 25) {
        this.ensureConnected();
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 25, 1), 100);
        return this.list("SELECT * FROM security_events WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?", [guildId, safeLimit]);
    }
}

module.exports = SecurityEventRepository;
