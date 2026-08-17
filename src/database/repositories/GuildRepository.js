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
                minimum_account_age_days = ?,
                suspicious_account_action = ?,
                raid_protection_enabled = ?,
                join_velocity_threshold = ?,
                join_velocity_window_seconds = ?,
                high_alert_minutes = ?,
                high_alert_action = ?,
                high_alert_minimum_account_age_days = ?,
                raid_alert_cooldown_minutes = ?,
                automatic_trusted_verification = ?,
                trusted_account_age_days = ?,
                remove_verified_role_on_deny = ?,
                scheduled_reports_enabled = ?,
                report_frequency = ?,
                report_channel_id = ?,
                report_hour_utc = ?,
                report_weekday = ?,
                quiet_hours_start_utc = ?,
                quiet_hours_end_utc = ?,
                minimum_alert_severity = ?,
                verification_preset = ?,
                strict_minimum_account_age_days = ?,
                reverify_after_days = ?,
                reverification_enforcement_enabled = ?,
                reverification_paused = ?,
                reverification_grace_days = ?,
                reverification_reminder_days = ?,
                reverification_notify_dm = ?,
                reverification_channel_id = ?,
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
                settings.minimumAccountAgeDays,
                settings.suspiciousAccountAction,
                settings.raidProtectionEnabled ? 1 : 0,
                settings.joinVelocityThreshold,
                settings.joinVelocityWindowSeconds,
                settings.highAlertMinutes,
                settings.highAlertAction,
                settings.highAlertMinimumAccountAgeDays,
                settings.raidAlertCooldownMinutes,
                settings.automaticTrustedVerification ? 1 : 0,
                settings.trustedAccountAgeDays,
                settings.removeVerifiedRoleOnDeny ? 1 : 0,
                settings.scheduledReportsEnabled ? 1 : 0,
                settings.reportFrequency,
                settings.reportChannelId ?? null,
                settings.reportHourUtc,
                settings.reportWeekday,
                settings.quietHoursStartUtc,
                settings.quietHoursEndUtc,
                settings.minimumAlertSeverity,
                settings.verificationPreset,
                settings.strictMinimumAccountAgeDays,
                settings.reverifyAfterDays,
                settings.reverificationEnforcementEnabled ? 1 : 0,
                settings.reverificationPaused ? 1 : 0,
                settings.reverificationGraceDays,
                settings.reverificationReminderDays,
                settings.reverificationNotifyDm ? 1 : 0,
                settings.reverificationChannelId ?? null,
                settings.updatedBy ?? null,
                guildId
            ]
        );

    }

    setHighAlertUntil(guildId, timestamp) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET high_alert_until = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?", [timestamp, guildId]);
    }

    setLastRaidAlertAt(guildId, timestamp) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET last_raid_alert_at = ? WHERE guild_id = ?", [timestamp, guildId]);
    }

    setLastReportAt(guildId, timestamp) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET last_report_at = ? WHERE guild_id = ?", [timestamp, guildId]);
    }

    incrementPolicyVersion(guildId) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET policy_version = policy_version + 1, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?", [guildId]);
    }

    setReverificationPaused(guildId, paused) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET reverification_paused = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?", [paused ? 1 : 0, guildId]);
    }

    markSetupComplete(guildId, userId, timestamp = Date.now()) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET setup_completed_at = ?, setup_completed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?", [timestamp, userId, guildId]);
    }

    updateHealth(guildId, score, timestamp = Date.now()) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET last_health_score = ?, last_health_checked_at = ? WHERE guild_id = ?", [score, timestamp, guildId]);
    }

    updateOnboardingSettings(guildId, settings) {
        this.ensureConnected();
        return this.run(`UPDATE guild_settings SET onboarding_enabled = ?, onboarding_delivery_mode = ?,
            onboarding_channel_id = ?, onboarding_welcome_title = ?, onboarding_welcome_message = ?,
            onboarding_rules_text = ?, onboarding_links_json = ?, onboarding_require_acknowledgement = ?,
            onboarding_acknowledgement_text = ?, onboarding_secondary_role_id = ?, onboarding_include_trusted = ?,
            onboarding_include_manual = ?, onboarding_followup_enabled = ?, onboarding_followup_delay_minutes = ?,
            onboarding_followup_message = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`, [
            settings.enabled ? 1 : 0, settings.deliveryMode, settings.channelId, settings.welcomeTitle,
            settings.welcomeMessage, settings.rulesText, JSON.stringify(settings.links), settings.requireAcknowledgement ? 1 : 0,
            settings.acknowledgementText, settings.secondaryRoleId, settings.includeTrusted ? 1 : 0,
            settings.includeManual ? 1 : 0, settings.followupEnabled ? 1 : 0, settings.followupDelayMinutes,
            settings.followupMessage, settings.updatedBy, guildId
        ]);
    }

    setLastHealthAlertAt(guildId, timestamp = Date.now()) {
        this.ensureConnected();
        return this.run("UPDATE guild_settings SET last_health_alert_at = ? WHERE guild_id = ?", [timestamp, guildId]);
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
