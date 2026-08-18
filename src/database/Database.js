const fs = require("fs");
const path = require("path");
const SQLite = require("better-sqlite3");
const { Pool } = require("pg");
const GuildRepository = require("./repositories/GuildRepository");
const CaptchaRepository = require("./repositories/CaptchaRepository");
const LogRepository = require("./repositories/LogRepository");
const SecurityEventRepository = require("./repositories/SecurityEventRepository");
const TrustPolicyRepository = require("./repositories/TrustPolicyRepository");
const ReportDeliveryRepository = require("./repositories/ReportDeliveryRepository");
const VerificationRecordRepository = require("./repositories/VerificationRecordRepository");
const ReverificationRepository = require("./repositories/ReverificationRepository");
const OnboardingDeliveryRepository = require("./repositories/OnboardingDeliveryRepository");

function postgresSql(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`)
        .replace(/date\(timestamp,\s*'unixepoch'\)/gi, "to_char(to_timestamp(timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD')");
}

class Database {
    constructor(options) {
        this.options = typeof options === "string" ? { path: options } : options;
        this.engine = this.options.url ? "postgres" : "sqlite";
        this.db = null;
        this.guilds = null;
        this.captchas = null;
        this.logs = null;
        this.securityEvents = null;
        this.trustPolicies = null;
        this.reportDeliveries = null;
        this.verificationRecords = null;
        this.reverifications = null;
        this.onboardingDeliveries = null;
        this.cleanupTimer = null;
    }

    async initialize() {
        if (this.engine === "postgres") {
            this.db = new Pool({ connectionString: this.options.url,
                ssl: this.options.ssl ? { rejectUnauthorized: false } : false,
                max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
            await this.db.query("SELECT 1");
            await this.createPostgresSchema();
        } else {
            fs.mkdirSync(path.dirname(this.options.path), { recursive: true });
            this.db = new SQLite(this.options.path);
            this.db.pragma("journal_mode = WAL");
            this.db.pragma("foreign_keys = ON");
            this.db.pragma("synchronous = NORMAL");
            this.createSQLiteSchema();
        }
        this.guilds = new GuildRepository(this);
        this.captchas = new CaptchaRepository(this);
        this.logs = new LogRepository(this);
        this.securityEvents = new SecurityEventRepository(this);
        this.trustPolicies = new TrustPolicyRepository(this);
        this.reportDeliveries = new ReportDeliveryRepository(this);
        this.verificationRecords = new VerificationRecordRepository(this);
        this.reverifications = new ReverificationRepository(this);
        this.onboardingDeliveries = new OnboardingDeliveryRepository(this);
        await this.cleanup();
        this.cleanupTimer = setInterval(() => this.cleanup().catch(error => console.error("Database cleanup failed", error)), 3600000);
        this.cleanupTimer.unref();
        console.log(`Database: ${this.engine}`);
    }

    createSQLiteSchema() {
        this.db.exec(this.schema("INTEGER PRIMARY KEY AUTOINCREMENT", "DATETIME"));
        this.migrateSQLiteSchema();
        this.db.pragma("optimize");
    }

    async createPostgresSchema() {
        await this.db.query(this.schema("BIGSERIAL PRIMARY KEY", "TIMESTAMPTZ"));
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS minimum_account_age_days INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS suspicious_account_action TEXT DEFAULT 'BLOCK'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS raid_protection_enabled INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS join_velocity_threshold INTEGER DEFAULT 10");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS join_velocity_window_seconds INTEGER DEFAULT 60");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS high_alert_minutes INTEGER DEFAULT 10");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS high_alert_until BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS high_alert_action TEXT DEFAULT 'MONITOR'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS high_alert_minimum_account_age_days INTEGER DEFAULT 7");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS raid_alert_cooldown_minutes INTEGER DEFAULT 30");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_raid_alert_at BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS automatic_trusted_verification INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS trusted_account_age_days INTEGER DEFAULT 90");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS remove_verified_role_on_deny INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS scheduled_reports_enabled INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS report_frequency TEXT DEFAULT 'WEEKLY'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS report_channel_id TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS report_hour_utc INTEGER DEFAULT 12");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS report_weekday INTEGER DEFAULT 1");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS quiet_hours_start_utc INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS quiet_hours_end_utc INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS minimum_alert_severity TEXT DEFAULT 'WARNING'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_report_at BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS verification_preset TEXT DEFAULT 'STANDARD'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS strict_minimum_account_age_days INTEGER DEFAULT 7");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverify_after_days INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS policy_version INTEGER DEFAULT 1");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_enforcement_enabled INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_paused INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_grace_days INTEGER DEFAULT 7");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_reminder_days INTEGER DEFAULT 3");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_notify_dm INTEGER DEFAULT 1");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS reverification_channel_id TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS setup_completed_at BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS setup_completed_by TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_health_score INTEGER");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_health_checked_at BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS last_health_alert_at BIGINT DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_enabled INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_delivery_mode TEXT DEFAULT 'DM'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_channel_id TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_welcome_title TEXT DEFAULT 'Welcome to the server'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_welcome_message TEXT DEFAULT 'Welcome, {user}! You are now verified in {server}.'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_rules_text TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_links_json TEXT DEFAULT '[]'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_require_acknowledgement INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_acknowledgement_text TEXT DEFAULT 'I understand'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_secondary_role_id TEXT");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_include_trusted INTEGER DEFAULT 1");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_include_manual INTEGER DEFAULT 1");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_followup_enabled INTEGER DEFAULT 0");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_followup_delay_minutes INTEGER DEFAULT 60");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS onboarding_followup_message TEXT DEFAULT 'Need help getting started? Review the server resources or contact a moderator.'");
        await this.db.query("ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS data_retention_days INTEGER DEFAULT 0");
    }

    schema(logId, dateType) {
        return `
            CREATE TABLE IF NOT EXISTS guild_settings (
                guild_id TEXT PRIMARY KEY, verify_channel_id TEXT, verify_message_id TEXT,
                verified_role_id TEXT, verification_enabled INTEGER DEFAULT 1, log_channel_id TEXT,
                message_title TEXT DEFAULT 'Server Verification',
                message_description TEXT DEFAULT 'Complete the CAPTCHA below to gain access to the server.',
                message_color TEXT DEFAULT '#5865F2', button_label TEXT DEFAULT 'Verify',
                success_message TEXT DEFAULT 'You have been verified successfully.', captcha_length INTEGER DEFAULT 6,
                captcha_expiration_minutes INTEGER DEFAULT 5, max_attempts INTEGER DEFAULT 5,
                cooldown_seconds INTEGER DEFAULT 30, lockout_minutes INTEGER DEFAULT 10,
                captcha_difficulty TEXT DEFAULT 'MEDIUM', minimum_account_age_days INTEGER DEFAULT 0,
                suspicious_account_action TEXT DEFAULT 'BLOCK', updated_by TEXT,
                raid_protection_enabled INTEGER DEFAULT 0, join_velocity_threshold INTEGER DEFAULT 10,
                join_velocity_window_seconds INTEGER DEFAULT 60, high_alert_minutes INTEGER DEFAULT 10,
                high_alert_until BIGINT DEFAULT 0,
                high_alert_action TEXT DEFAULT 'MONITOR', high_alert_minimum_account_age_days INTEGER DEFAULT 7,
                raid_alert_cooldown_minutes INTEGER DEFAULT 30, last_raid_alert_at BIGINT DEFAULT 0,
                automatic_trusted_verification INTEGER DEFAULT 0, trusted_account_age_days INTEGER DEFAULT 90,
                remove_verified_role_on_deny INTEGER DEFAULT 0,
                scheduled_reports_enabled INTEGER DEFAULT 0, report_frequency TEXT DEFAULT 'WEEKLY',
                report_channel_id TEXT, report_hour_utc INTEGER DEFAULT 12, report_weekday INTEGER DEFAULT 1,
                quiet_hours_start_utc INTEGER DEFAULT 0, quiet_hours_end_utc INTEGER DEFAULT 0,
                minimum_alert_severity TEXT DEFAULT 'WARNING', last_report_at BIGINT DEFAULT 0,
                verification_preset TEXT DEFAULT 'STANDARD', strict_minimum_account_age_days INTEGER DEFAULT 7,
                reverify_after_days INTEGER DEFAULT 0, policy_version INTEGER DEFAULT 1,
                reverification_enforcement_enabled INTEGER DEFAULT 0, reverification_paused INTEGER DEFAULT 0,
                reverification_grace_days INTEGER DEFAULT 7, reverification_reminder_days INTEGER DEFAULT 3,
                reverification_notify_dm INTEGER DEFAULT 1, reverification_channel_id TEXT,
                setup_completed_at BIGINT DEFAULT 0, setup_completed_by TEXT, last_health_score INTEGER,
                last_health_checked_at BIGINT DEFAULT 0, last_health_alert_at BIGINT DEFAULT 0,
                onboarding_enabled INTEGER DEFAULT 0, onboarding_delivery_mode TEXT DEFAULT 'DM', onboarding_channel_id TEXT,
                onboarding_welcome_title TEXT DEFAULT 'Welcome to the server',
                onboarding_welcome_message TEXT DEFAULT 'Welcome, {user}! You are now verified in {server}.',
                onboarding_rules_text TEXT, onboarding_links_json TEXT DEFAULT '[]', onboarding_require_acknowledgement INTEGER DEFAULT 0,
                onboarding_acknowledgement_text TEXT DEFAULT 'I understand', onboarding_secondary_role_id TEXT,
                onboarding_include_trusted INTEGER DEFAULT 1, onboarding_include_manual INTEGER DEFAULT 1,
                onboarding_followup_enabled INTEGER DEFAULT 0, onboarding_followup_delay_minutes INTEGER DEFAULT 60,
                onboarding_followup_message TEXT DEFAULT 'Need help getting started? Review the server resources or contact a moderator.',
                data_retention_days INTEGER DEFAULT 0,
                created_at ${dateType} DEFAULT CURRENT_TIMESTAMP, updated_at ${dateType} DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS captchas (
                user_id TEXT, guild_id TEXT, captcha_id TEXT, captcha_hash TEXT, captcha_salt TEXT,
                attempts INTEGER DEFAULT 0, max_attempts INTEGER, created_at BIGINT, expires_at BIGINT,
                PRIMARY KEY(user_id, guild_id)
            );
            CREATE TABLE IF NOT EXISTS verification_logs (
                id ${logId}, guild_id TEXT, user_id TEXT, success INTEGER, failure_reason TEXT,
                timestamp BIGINT, ip_hash TEXT, attempts INTEGER, verification_duration INTEGER, bot_version TEXT
            );
            CREATE TABLE IF NOT EXISTS dashboard_sessions (
                session_id TEXT PRIMARY KEY, session_data TEXT NOT NULL, expires_at BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS security_events (
                id ${logId}, guild_id TEXT, type TEXT NOT NULL, details TEXT, timestamp BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS trust_policies (
                guild_id TEXT, subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, policy TEXT NOT NULL,
                reason TEXT, expires_at BIGINT DEFAULT 0, created_by TEXT, created_at BIGINT NOT NULL,
                PRIMARY KEY(guild_id, subject_type, subject_id)
            );
            CREATE TABLE IF NOT EXISTS report_deliveries (
                id ${logId}, guild_id TEXT, delivery_type TEXT NOT NULL, period TEXT,
                channel_id TEXT, success INTEGER NOT NULL, attempts INTEGER DEFAULT 1,
                error TEXT, timestamp BIGINT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS member_verifications (
                guild_id TEXT, user_id TEXT, verified_at BIGINT NOT NULL, policy_version INTEGER NOT NULL,
                method TEXT NOT NULL, PRIMARY KEY(guild_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS pending_reverifications (
                guild_id TEXT, user_id TEXT, detected_at BIGINT NOT NULL, due_at BIGINT NOT NULL,
                reason TEXT NOT NULL, status TEXT DEFAULT 'PENDING', last_reminded_at BIGINT DEFAULT 0,
                reminder_count INTEGER DEFAULT 0, enforced_at BIGINT DEFAULT 0,
                PRIMARY KEY(guild_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS onboarding_deliveries (
                delivery_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, trigger_type TEXT NOT NULL,
                destinations TEXT, status TEXT NOT NULL, error TEXT, created_at BIGINT NOT NULL,
                acknowledged_at BIGINT DEFAULT 0, followup_due_at BIGINT DEFAULT 0, followup_sent_at BIGINT DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_verification_logs_guild_timestamp ON verification_logs(guild_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_captchas_expires_at ON captchas(expires_at);
            CREATE INDEX IF NOT EXISTS idx_verification_logs_guild_success_timestamp ON verification_logs(guild_id, success, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires_at ON dashboard_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_security_events_guild_timestamp ON security_events(guild_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_trust_policies_guild ON trust_policies(guild_id, policy);
            CREATE INDEX IF NOT EXISTS idx_report_deliveries_guild_timestamp ON report_deliveries(guild_id, timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_member_verifications_guild_version ON member_verifications(guild_id, policy_version);
            CREATE INDEX IF NOT EXISTS idx_pending_reverifications_guild_due ON pending_reverifications(guild_id, status, due_at);
            CREATE INDEX IF NOT EXISTS idx_onboarding_deliveries_guild_created ON onboarding_deliveries(guild_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_onboarding_deliveries_followup_due ON onboarding_deliveries(followup_due_at, followup_sent_at);
            CREATE INDEX IF NOT EXISTS idx_security_events_guild_type_timestamp ON security_events(guild_id, type, timestamp DESC);
        `;
    }

    migrateSQLiteSchema() {
        const columns = table => new Set(this.db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
        const captchaColumns = columns("captchas");
        if (!captchaColumns.has("captcha_hash")) this.db.exec("ALTER TABLE captchas ADD COLUMN captcha_hash TEXT");
        if (!captchaColumns.has("captcha_salt")) this.db.exec("ALTER TABLE captchas ADD COLUMN captcha_salt TEXT");
        const guildColumns = columns("guild_settings");
        const additions = [["message_title", "TEXT DEFAULT 'Server Verification'"],
            ["message_description", "TEXT DEFAULT 'Complete the CAPTCHA below to gain access to the server.'"],
            ["message_color", "TEXT DEFAULT '#5865F2'"], ["button_label", "TEXT DEFAULT 'Verify'"],
            ["success_message", "TEXT DEFAULT 'You have been verified successfully.'"], ["captcha_length", "INTEGER DEFAULT 6"],
            ["captcha_expiration_minutes", "INTEGER DEFAULT 5"], ["max_attempts", "INTEGER DEFAULT 5"],
            ["cooldown_seconds", "INTEGER DEFAULT 30"], ["lockout_minutes", "INTEGER DEFAULT 10"],
            ["captcha_difficulty", "TEXT DEFAULT 'MEDIUM'"], ["minimum_account_age_days", "INTEGER DEFAULT 0"],
            ["suspicious_account_action", "TEXT DEFAULT 'BLOCK'"], ["updated_by", "TEXT"]];
        additions.push(["raid_protection_enabled", "INTEGER DEFAULT 0"], ["join_velocity_threshold", "INTEGER DEFAULT 10"],
            ["join_velocity_window_seconds", "INTEGER DEFAULT 60"], ["high_alert_minutes", "INTEGER DEFAULT 10"],
            ["high_alert_until", "BIGINT DEFAULT 0"]);
        additions.push(["high_alert_action", "TEXT DEFAULT 'MONITOR'"],
            ["high_alert_minimum_account_age_days", "INTEGER DEFAULT 7"],
            ["raid_alert_cooldown_minutes", "INTEGER DEFAULT 30"], ["last_raid_alert_at", "BIGINT DEFAULT 0"]);
        additions.push(["automatic_trusted_verification", "INTEGER DEFAULT 0"], ["trusted_account_age_days", "INTEGER DEFAULT 90"]);
        additions.push(["remove_verified_role_on_deny", "INTEGER DEFAULT 0"]);
        additions.push(["scheduled_reports_enabled", "INTEGER DEFAULT 0"], ["report_frequency", "TEXT DEFAULT 'WEEKLY'"],
            ["report_channel_id", "TEXT"], ["report_hour_utc", "INTEGER DEFAULT 12"], ["report_weekday", "INTEGER DEFAULT 1"],
            ["quiet_hours_start_utc", "INTEGER DEFAULT 0"], ["quiet_hours_end_utc", "INTEGER DEFAULT 0"],
            ["minimum_alert_severity", "TEXT DEFAULT 'WARNING'"], ["last_report_at", "BIGINT DEFAULT 0"]);
        additions.push(["verification_preset", "TEXT DEFAULT 'STANDARD'"], ["strict_minimum_account_age_days", "INTEGER DEFAULT 7"],
            ["reverify_after_days", "INTEGER DEFAULT 0"], ["policy_version", "INTEGER DEFAULT 1"]);
        additions.push(["reverification_enforcement_enabled", "INTEGER DEFAULT 0"], ["reverification_paused", "INTEGER DEFAULT 0"],
            ["reverification_grace_days", "INTEGER DEFAULT 7"], ["reverification_reminder_days", "INTEGER DEFAULT 3"],
            ["reverification_notify_dm", "INTEGER DEFAULT 1"], ["reverification_channel_id", "TEXT"]);
        additions.push(["setup_completed_at", "BIGINT DEFAULT 0"], ["setup_completed_by", "TEXT"],
            ["last_health_score", "INTEGER"], ["last_health_checked_at", "BIGINT DEFAULT 0"],
            ["last_health_alert_at", "BIGINT DEFAULT 0"]);
        additions.push(["onboarding_enabled", "INTEGER DEFAULT 0"], ["onboarding_delivery_mode", "TEXT DEFAULT 'DM'"],
            ["onboarding_channel_id", "TEXT"], ["onboarding_welcome_title", "TEXT DEFAULT 'Welcome to the server'"],
            ["onboarding_welcome_message", "TEXT DEFAULT 'Welcome, {user}! You are now verified in {server}.'"],
            ["onboarding_rules_text", "TEXT"], ["onboarding_links_json", "TEXT DEFAULT '[]'"],
            ["onboarding_require_acknowledgement", "INTEGER DEFAULT 0"], ["onboarding_acknowledgement_text", "TEXT DEFAULT 'I understand'"],
            ["onboarding_secondary_role_id", "TEXT"], ["onboarding_include_trusted", "INTEGER DEFAULT 1"],
            ["onboarding_include_manual", "INTEGER DEFAULT 1"], ["onboarding_followup_enabled", "INTEGER DEFAULT 0"],
            ["onboarding_followup_delay_minutes", "INTEGER DEFAULT 60"],
            ["onboarding_followup_message", "TEXT DEFAULT 'Need help getting started? Review the server resources or contact a moderator.'"]);
        additions.push(["data_retention_days", "INTEGER DEFAULT 0"]);
        for (const [name, definition] of additions) {
            if (!guildColumns.has(name)) this.db.exec(`ALTER TABLE guild_settings ADD COLUMN ${name} ${definition}`);
        }
    }

    async run(sql, params = []) {
        if (this.engine === "postgres") {
            const result = await this.db.query(postgresSql(sql), params);
            return { changes: result.rowCount };
        }
        return this.db.prepare(sql).run(...params);
    }

    async get(sql, params = []) {
        if (this.engine === "postgres") return (await this.db.query(postgresSql(sql), params)).rows[0];
        return this.db.prepare(sql).get(...params);
    }

    async all(sql, params = []) {
        if (this.engine === "postgres") return (await this.db.query(postgresSql(sql), params)).rows;
        return this.db.prepare(sql).all(...params);
    }

    transaction(callback) {
        if (this.engine === "postgres") throw new Error("Use explicit asynchronous PostgreSQL transactions.");
        return this.db.transaction(callback);
    }

    async cleanup() {
        const now = Date.now();
        await this.run("DELETE FROM captchas WHERE expires_at <= ?", [now]);
        await this.run("DELETE FROM dashboard_sessions WHERE expires_at <= ?", [now]);
        await this.run("DELETE FROM trust_policies WHERE expires_at > 0 AND expires_at <= ?", [now]);
        const days = Number(this.options.logRetentionDays) || 0;
        if (days > 0) {
            await this.run("DELETE FROM verification_logs WHERE timestamp < ?", [Math.floor(now / 1000) - days * 86400]);
        }
        if (this.guilds) {
            for (const settings of await this.guilds.getAllSettings()) {
                const retentionDays = Number(settings.data_retention_days) || 0;
                if (retentionDays > 0) {
                    const secondsCutoff = Math.floor(now / 1000) - retentionDays * 86400;
                    const millisecondsCutoff = now - retentionDays * 86400000;
                    await this.run("DELETE FROM verification_logs WHERE guild_id = ? AND timestamp < ?", [settings.guild_id, secondsCutoff]);
                    await this.run("DELETE FROM security_events WHERE guild_id = ? AND timestamp < ?", [settings.guild_id, millisecondsCutoff]);
                    await this.run("DELETE FROM onboarding_deliveries WHERE guild_id = ? AND created_at < ?", [settings.guild_id, millisecondsCutoff]);
                }
            }
        }
    }

    async health() {
        if (!this.db) return { connected: false, engine: this.engine };
        try {
            await this.get("SELECT 1 AS ok");
            return { connected: true, engine: this.engine };
        } catch (error) {
            console.error("Database health check failed", error);
            return { connected: false, engine: this.engine };
        }
    }

    isConnected() { return this.db !== null; }
    async close() {
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        if (!this.db) return;
        if (this.engine === "postgres") await this.db.end(); else this.db.close();
        this.db = null;
    }
}

module.exports = Database;
