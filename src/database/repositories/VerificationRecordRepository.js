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

    remove(guildId, userId) {
        this.ensureConnected();
        return this.run("DELETE FROM member_verifications WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
    }
}

module.exports = VerificationRecordRepository;
