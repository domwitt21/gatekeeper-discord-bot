const crypto = require("node:crypto");
const BaseRepository = require("./BaseRepository");

class OnboardingDeliveryRepository extends BaseRepository {
    create(entry) {
        const id = entry.id || crypto.randomUUID();
        return this.run(`INSERT INTO onboarding_deliveries
            (delivery_id, guild_id, user_id, trigger_type, destinations, status, error, created_at,
             acknowledged_at, followup_due_at, followup_sent_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)`, [id, entry.guildId, entry.userId, entry.triggerType,
            entry.destinations || "", entry.status, entry.error ? String(entry.error).slice(0, 500) : null,
            entry.createdAt || Date.now(), entry.followupDueAt || 0]).then(() => id);
    }

    recent(guildId, limit = 20) {
        const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
        return this.list("SELECT * FROM onboarding_deliveries WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?", [guildId, safeLimit]);
    }

    latestAwaiting(guildId, userId) {
        return this.first(`SELECT * FROM onboarding_deliveries WHERE guild_id = ? AND user_id = ?
            AND acknowledged_at = 0 AND status != 'FAILED' ORDER BY created_at DESC LIMIT 1`, [guildId, userId]);
    }

    acknowledge(deliveryId, acknowledgedAt, followupDueAt) {
        return this.run("UPDATE onboarding_deliveries SET acknowledged_at = ?, followup_due_at = ? WHERE delivery_id = ? AND acknowledged_at = 0",
            [acknowledgedAt, followupDueAt || 0, deliveryId]);
    }

    dueFollowups(now = Date.now(), limit = 25) {
        const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
        return this.list(`SELECT * FROM onboarding_deliveries WHERE followup_due_at > 0
            AND followup_due_at <= ? AND followup_sent_at = 0 AND status != 'FAILED'
            ORDER BY followup_due_at ASC LIMIT ?`, [now, safeLimit]);
    }

    markFollowup(deliveryId, timestamp = Date.now(), error = null) {
        return this.run("UPDATE onboarding_deliveries SET followup_sent_at = ?, error = COALESCE(?, error) WHERE delivery_id = ?",
            [timestamp, error ? String(error).slice(0, 500) : null, deliveryId]);
    }
}

module.exports = OnboardingDeliveryRepository;
