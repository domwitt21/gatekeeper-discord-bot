const BaseRepository = require("./BaseRepository");

class ReverificationRepository extends BaseRepository {
    upsert(item) {
        this.ensureConnected();
        return this.run(`INSERT INTO pending_reverifications
            (guild_id, user_id, detected_at, due_at, reason, status, last_reminded_at, reminder_count)
            VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 0)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET
            due_at = excluded.due_at, reason = excluded.reason`, [
            item.guildId, item.userId, item.detectedAt ?? Date.now(), item.dueAt, item.reason
        ]);
    }

    find(guildId, userId) {
        return this.first("SELECT * FROM pending_reverifications WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }

    listForGuild(guildId, limit = 100) {
        const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
        return this.list("SELECT * FROM pending_reverifications WHERE guild_id = ? AND status = 'PENDING' ORDER BY due_at ASC LIMIT ?", [guildId, safeLimit]);
    }

    listPending(limit = 25) {
        const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
        return this.list("SELECT * FROM pending_reverifications WHERE status = 'PENDING' ORDER BY due_at ASC LIMIT ?", [safeLimit]);
    }

    markReminded(guildId, userId, timestamp = Date.now()) {
        return this.run("UPDATE pending_reverifications SET last_reminded_at = ?, reminder_count = reminder_count + 1 WHERE guild_id = ? AND user_id = ?", [timestamp, guildId, userId]);
    }

    markEnforced(guildId, userId, timestamp = Date.now()) {
        return this.run("UPDATE pending_reverifications SET status = 'ENFORCED', enforced_at = ? WHERE guild_id = ? AND user_id = ?", [timestamp, guildId, userId]);
    }

    markCancelled(guildId, userId) {
        return this.run("UPDATE pending_reverifications SET status = 'CANCELLED' WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }

    remove(guildId, userId) {
        return this.run("DELETE FROM pending_reverifications WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }
}

module.exports = ReverificationRepository;
