/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Captcha Repository
 *
 * Handles the lifecycle of active CAPTCHA sessions.
 *
 * Responsibilities:
 *  • Create sessions
 *  • Retrieve sessions
 *  • Increment attempts
 *  • Delete sessions
 *  • Cleanup expired sessions
 * ============================================================
 */

const BaseRepository = require("./BaseRepository");

class CaptchaRepository extends BaseRepository {

    /**
     * Create or replace a CAPTCHA session.
     *
     * @param {Object} captcha
     * @returns {*}
     */
    create(captcha) {

        this.ensureConnected();

        return this.run(
            `
            INSERT INTO captchas
            (
                user_id,
                guild_id,
                captcha_id,
                captcha_hash,
                captcha_salt,
                attempts,
                max_attempts,
                created_at,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT(user_id, guild_id)
            DO UPDATE SET

                captcha_id = excluded.captcha_id,
                captcha_hash = excluded.captcha_hash,
                captcha_salt = excluded.captcha_salt,
                attempts = excluded.attempts,
                max_attempts = excluded.max_attempts,
                created_at = excluded.created_at,
                expires_at = excluded.expires_at;
            `,
            [
                captcha.userId,
                captcha.guildId,
                captcha.captchaId,
                captcha.hash,
                captcha.salt,
                captcha.attempts ?? 0,
                captcha.maxAttempts,
                captcha.createdAt,
                captcha.expiresAt
            ]
        );

    }

    /**
     * Find an active CAPTCHA session.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {Object|null}
     */
    find(guildId, userId) {

        this.ensureConnected();

        return this.first(
            `
            SELECT *
            FROM captchas
            WHERE guild_id = ?
            AND user_id = ?
            `,
            [
                guildId,
                userId
            ]
        );

    }

    /**
     * Increment failed attempts.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {*}
     */
    incrementAttempts(guildId, userId) {

        this.ensureConnected();

        return this.run(
            `
            UPDATE captchas

            SET attempts = attempts + 1

            WHERE guild_id = ?
            AND user_id = ?
            `,
            [
                guildId,
                userId
            ]
        );

    }

    /**
     * Delete a user's CAPTCHA.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {*}
     */
    delete(guildId, userId) {

        this.ensureConnected();

        return this.run(
            `
            DELETE FROM captchas
            WHERE guild_id = ?
            AND user_id = ?
            `,
            [
                guildId,
                userId
            ]
        );

    }

    /**
     * Remove expired CAPTCHAs.
     *
     * @returns {*}
     */
    cleanupExpired() {

        this.ensureConnected();

        return this.run(
            `
            DELETE FROM captchas
            WHERE expires_at <= ?
            `,
            [
                this.nowMs()
            ]
        );

    }

    /**
     * Determine whether a user has an active CAPTCHA.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {boolean}
     */
    hasActive(guildId, userId) {

        this.ensureConnected();

        return this.exists(
            `
            SELECT 1
            FROM captchas
            WHERE guild_id = ?
            AND user_id = ?
            `,
            [
                guildId,
                userId
            ]
        );

    }

    /**
     * Determine whether a CAPTCHA has expired.
     *
     * @param {Object} captcha
     * @returns {boolean}
     */
    isExpired(captcha) {

        return this.nowMs() >= captcha.expires_at;

    }

    /**
     * Get all active CAPTCHA sessions.
     *
     * Primarily used for diagnostics.
     *
     * @returns {Array}
     */
    getAll() {

        this.ensureConnected();

        return this.list(
            `
            SELECT *
            FROM captchas
            ORDER BY created_at ASC
            `
        );

    }

    /**
     * Get the number of active CAPTCHA sessions.
     *
     * @returns {number}
     */
    getActiveCount() {

        this.ensureConnected();

        return this.count(
            `
            SELECT COUNT(*) AS count
            FROM captchas
            `
        );

    }

    /**
     * ============================================================
     * Compatibility Helpers
     * ============================================================
     *
     * These aliases maintain compatibility with the
     * VerificationManager and future services.
     * ============================================================
     */

    /**
     * Find an active CAPTCHA session.
     */
    findActive(guildId, userId) {

        return this.find(guildId, userId);

    }

    /**
     * Delete an active CAPTCHA session.
     */
    deleteActive(guildId, userId) {

        return this.delete(guildId, userId);

    }

        /**
     * ============================================================
     * Find Active CAPTCHA Session
     * ============================================================
     *
     * Compatibility wrapper used by VerificationManager.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {Object|null}
     */
    findActive(guildId, userId) {

        return this.find(
            guildId,
            userId
        );

    }

    /**
     * ============================================================
     * Delete Active CAPTCHA Session
     * ============================================================
     *
     * Compatibility wrapper used by VerificationManager.
     *
     * @param {string} guildId
     * @param {string} userId
     * @returns {*}
     */
    deleteActive(guildId, userId) {

        return this.delete(
            guildId,
            userId
        );

    }

    complete(userId, guildId) {

        this.ensureConnected();

        return this.run(
            `
            DELETE FROM captchas
            WHERE user_id = ?
            AND guild_id = ?
            `,
            [
                userId,
                guildId
            ]
        );

    }
}

module.exports = CaptchaRepository;
