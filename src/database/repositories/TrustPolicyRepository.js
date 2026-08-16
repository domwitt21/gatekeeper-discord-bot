const BaseRepository = require("./BaseRepository");

class TrustPolicyRepository extends BaseRepository {
    upsert(policy) {
        this.ensureConnected();
        return this.run(`INSERT INTO trust_policies
            (guild_id, subject_type, subject_id, policy, reason, expires_at, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id, subject_type, subject_id) DO UPDATE SET
            policy = excluded.policy, reason = excluded.reason, expires_at = excluded.expires_at,
            created_by = excluded.created_by, created_at = excluded.created_at`, [
            policy.guildId, policy.subjectType, policy.subjectId, policy.policy,
            policy.reason ?? null, policy.expiresAt ?? 0, policy.createdBy ?? null, Date.now()
        ]);
    }

    remove(guildId, subjectType, subjectId) {
        this.ensureConnected();
        return this.run("DELETE FROM trust_policies WHERE guild_id = ? AND subject_type = ? AND subject_id = ?", [guildId, subjectType, subjectId]);
    }

    listForGuild(guildId) {
        this.ensureConnected();
        return this.list("SELECT * FROM trust_policies WHERE guild_id = ? ORDER BY policy ASC, created_at DESC", [guildId]);
    }
}

module.exports = TrustPolicyRepository;
