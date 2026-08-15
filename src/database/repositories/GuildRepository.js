/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Guild Repository
 *
 * Handles all verification configuration for guilds.
 *
 * Responsibilities:
 *  • Save verification settings
 *  • Retrieve settings
 *  • Update verification message ID
 *  • Remove configuration
 *  • Check configuration status
 * ============================================================
 */

const BaseRepository = require("./BaseRepository");

class GuildRepository extends BaseRepository {

    /**
     * Save or update a guild's verification settings.
     *
     * @param {Object} settings
     * @returns {*}
     */
    saveSettings(settings) {

        this.ensureConnected();

        return this.run(
            `
            INSERT INTO guild_settings
            (
                guild_id,
                verify_channel_id,
                verify_message_id,
                verified_role_id,
                log_channel_id,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

            ON CONFLICT(guild_id)
            DO UPDATE SET

                verify_channel_id = excluded.verify_channel_id,
                verify_message_id = excluded.verify_message_id,
                verified_role_id = excluded.verified_role_id,
                log_channel_id = excluded.log_channel_id,
                updated_at = CURRENT_TIMESTAMP;
            `,
            [
                settings.guildId,
                settings.verifyChannelId,
                settings.verifyMessageId ?? null,
                settings.verifiedRoleId,
                settings.logChannelId ?? null
            ]
        );

    }

    /**
     * Get a guild's verification settings.
     *
     * @param {string} guildId
     * @returns {Object|null}
     */
    getSettings(guildId) {

        this.ensureConnected();

        return this.first(
            `
            SELECT *
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [guildId]
        );

    }

    updateDashboardSettings(guildId, settings) {

        this.ensureConnected();

        return this.run(
            `
            UPDATE guild_settings SET
                verification_enabled = ?,
                message_title = ?,
                message_description = ?,
                message_color = ?,
                button_label = ?,
                success_message = ?,
                captcha_length = ?,
                captcha_expiration_minutes = ?,
                max_attempts = ?,
                cooldown_seconds = ?,
                lockout_minutes = ?,
                captcha_difficulty = ?,
                updated_by = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ?
            `,
            [
                settings.verificationEnabled ? 1 : 0,
                settings.messageTitle,
                settings.messageDescription,
                settings.messageColor,
                settings.buttonLabel,
                settings.successMessage,
                settings.captchaLength,
                settings.captchaExpirationMinutes,
                settings.maxAttempts,
                settings.cooldownSeconds,
                settings.lockoutMinutes,
                settings.captchaDifficulty,
                settings.updatedBy ?? null,
                guildId
            ]
        );

    }

    /**
     * Update the verification message ID after posting.
     *
     * @param {string} guildId
     * @param {string} messageId
     * @returns {*}
     */
    updateMessageId(guildId, messageId) {

        this.ensureConnected();

        return this.run(
            `
            UPDATE guild_settings

            SET
                verify_message_id = ?,
                updated_at = CURRENT_TIMESTAMP

            WHERE guild_id = ?
            `,
            [
                messageId,
                guildId
            ]
        );

    }

    /**
     * Remove a guild's verification configuration.
     *
     * @param {string} guildId
     * @returns {*}
     */
    removeSettings(guildId) {

        this.ensureConnected();

        return this.run(
            `
            DELETE FROM guild_settings
            WHERE guild_id = ?
            `,
            [guildId]
        );

    }

    /**
     * Determine whether verification has been configured.
     *
     * @param {string} guildId
     * @returns {boolean}
     */
    isConfigured(guildId) {

        this.ensureConnected();

        return this.exists(
            `
            SELECT 1
            FROM guild_settings
            WHERE guild_id = ?
            `,
            [guildId]
        );

    }

    /**
     * Get every configured guild.
     *
     * Useful for startup validation and future dashboard
     * functionality.
     *
     * @returns {Array}
     */
    getAllSettings() {

        this.ensureConnected();

        return this.list(
            `
            SELECT *
            FROM guild_settings
            ORDER BY guild_id ASC
            `
        );

    }

    /**
     * Get the total number of configured guilds.
     *
     * @returns {number}
     */
    getConfiguredCount() {

        this.ensureConnected();

        return this.count(
            `
            SELECT COUNT(*) AS count
            FROM guild_settings
            `
        );

    }

}

module.exports = GuildRepository;
