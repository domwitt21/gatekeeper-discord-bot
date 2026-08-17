const BaseRepository = require("./BaseRepository");

class VerificationRecordRepository extends BaseRepository {
    upsert(record) {
        this.ensureConnected();
        return this.run(`INSERT INTO member_verifications
            (guild_id, user_id, verified_at, policy_version, method)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(guild_id, user_id) DO UPDATE SET verified_at = excluded.verified_at,
            policy_version = excluded.policy_version, method = excluded.method`, [
            record.guildId, record.userId, record.verifiedAt ?? Date.now(), record.policyVersion ?? 1, record.method ?? "CAPTCHA"
        ]);
    }

    find(guildId, userId) {
        this.ensureConnected();
        return this.first("SELECT * FROM member_verifications WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }

    listForGuild(guildId, limit = 100) {
        const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
        return this.list("SELECT * FROM member_verifications WHERE guild_id = ? ORDER BY verified_at ASC LIMIT ?", [guildId, safeLimit]);
    }

    listReverificationCandidates(guildId, policyVersion, verifiedBefore, limit = 25) {
        const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
        return this.list(`SELECT verification.* FROM member_verifications verification
            WHERE verification.guild_id = ?
            AND (verification.policy_version < ? OR (? > 0 AND verification.verified_at <= ?))
            AND NOT EXISTS (SELECT 1 FROM pending_reverifications pending
                WHERE pending.guild_id = verification.guild_id AND pending.user_id = verification.user_id)
            ORDER BY verification.verified_at ASC LIMIT ?`, [guildId, policyVersion, verifiedBefore, verifiedBefore, safeLimit]);
    }

    remove(guildId, userId) {
        this.ensureConnected();
        return this.run("DELETE FROM member_verifications WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }
}

module.exports = VerificationRecordRepository;
