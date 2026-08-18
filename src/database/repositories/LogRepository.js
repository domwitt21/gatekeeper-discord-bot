/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Log Repository
 *
 * Handles verification history and analytics.
 *
 * Responsibilities:
 *  • Record verification attempts
 *  • Retrieve verification history
 *  • Generate statistics
 *  • Cleanup old log entries
 * ============================================================
 */

const BaseRepository = require("./BaseRepository");

class LogRepository extends BaseRepository {

    /**
     * Record a verification attempt.
     *
     * @param {Object} entry
     * @returns {*}
     */
    record(entry) {

        this.ensureConnected();

        return this.run(
            `
            INSERT INTO verification_logs
            (
                guild_id,
                user_id,
                success,
                failure_reason,
                timestamp,
                attempts,
                verification_duration
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                entry.guildId,
                entry.userId,
                entry.success ? 1 : 0,
                entry.failureReason ?? null,
                entry.timestamp ?? this.now(),
                entry.attempts ?? null,
                entry.verificationDuration ?? null
            ]
        );

    }

    /**
     * Record a successful verification.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {*}
     */
    recordSuccess(guildId, userId) {

        return this.record({

            guildId,

            userId,

            success: true,

            timestamp: this.now()

        });

    }

    /**
     * Record a failed verification.
     *
     * @param {string} guildId
     * @param {string} userId
     * @param {string} reason
     * @returns {*}
     */
    recordFailure(guildId, userId, reason) {

        return this.record({

            guildId,

            userId,

            success: false,

            failureReason: reason,

            timestamp: this.now()

        });

    }

    /**
     * Retrieve recent verification attempts.
     *
     * @param {string} guildId
     * @param {number} limit
     * @returns {Array}
     */
    getRecent(guildId, limit = 25) {

        this.ensureConnected();

        return this.list(
            `
            SELECT *

            FROM verification_logs

            WHERE guild_id = ?

            ORDER BY timestamp DESC

            LIMIT ?
            `,
            [
                guildId,
                limit
            ]
        );

    }

    search(guildId, options = {}) {

        this.ensureConnected();

        const conditions = ["guild_id = ?"];
        const parameters = [guildId];

        if (options.result === "success" || options.result === "failed") {
            conditions.push("success = ?");
            parameters.push(options.result === "success" ? 1 : 0);
        }

        if (options.userId) {
            conditions.push("user_id LIKE ?");
            parameters.push(`%${options.userId}%`);
        }

        parameters.push(Math.min(Math.max(Number(options.limit) || 25, 1), 100));

        return this.list(
            `SELECT * FROM verification_logs
             WHERE ${conditions.join(" AND ")}
             ORDER BY timestamp DESC LIMIT ?`,
            parameters
        );

    }

    getDailyCounts(guildId, days = 7) {

        this.ensureConnected();

        return this.list(
            `SELECT date(timestamp, 'unixepoch') AS day,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successes,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures
             FROM verification_logs
             WHERE guild_id = ? AND timestamp >= ?
             GROUP BY day ORDER BY day ASC`,
            [guildId, this.now() - (days * 86400)]
        );

    }

    getTopFailureReasons(guildId, limit = 5) {

        this.ensureConnected();

        return this.list(
            `SELECT COALESCE(failure_reason, 'Unknown') AS reason, COUNT(*) AS count
             FROM verification_logs
             WHERE guild_id = ? AND success = 0
             GROUP BY failure_reason ORDER BY count DESC LIMIT ?`,
            [guildId, limit]
        );

    }

    /**
     * Count successful verifications.
     *
     * @param {string} guildId
     * @returns {number}
     */
    getSuccessCount(guildId) {

        this.ensureConnected();

        return this.count(
            `
            SELECT COUNT(*) AS count

            FROM verification_logs

            WHERE guild_id = ?

            AND success = 1
            `,
            [guildId]
        );

    }

    /**
     * Count failed verifications.
     *
     * @param {string} guildId
     * @returns {number}
     */
    getFailureCount(guildId) {

        this.ensureConnected();

        return this.count(
            `
            SELECT COUNT(*) AS count

            FROM verification_logs

            WHERE guild_id = ?

            AND success = 0
            `,
            [guildId]
        );

    }

    /**
     * Get total verification attempts.
     *
     * @param {string} guildId
     * @returns {number}
     */
    getTotalAttempts(guildId) {

        this.ensureConnected();

        return this.count(
            `
            SELECT COUNT(*) AS count

            FROM verification_logs

            WHERE guild_id = ?
            `,
            [guildId]
        );

    }

    /**
     * Calculate verification success rate.
     *
     * @param {string} guildId
     * @returns {number}
     */
    async getSuccessRate(guildId) {

        const total = await this.getTotalAttempts(guildId);

        if (total === 0) {

            return 0;

        }

        const success = await this.getSuccessCount(guildId);

        return Number(
            ((success / total) * 100).toFixed(2)
        );

    }

    /**
     * Delete log entries older than the specified age.
     *
     * @param {number} maxAgeSeconds
     * @returns {*}
     */
    cleanup(maxAgeSeconds) {

        this.ensureConnected();

        return this.run(
            `
            DELETE

            FROM verification_logs

            WHERE timestamp < ?
            `,
            [
                this.now() - maxAgeSeconds
            ]
        );

    }

}

module.exports = LogRepository;
