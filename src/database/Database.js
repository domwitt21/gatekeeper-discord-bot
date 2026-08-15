/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Database Engine
 *
 * Responsibilities:
 *  • Manage SQLite connection
 *  • Initialize database schema
 *  • Expose repositories
 *  • Provide generic query helpers
 * ============================================================
 */

const fs = require("fs");
const path = require("path");
const DatabaseDriver = require("better-sqlite3");

const GuildRepository = require("./repositories/GuildRepository");
const CaptchaRepository = require("./repositories/CaptchaRepository");
const LogRepository = require("./repositories/LogRepository");

class Database {

    constructor(databasePath) {

        this.databasePath = databasePath;

        this.db = null;

        /**
         * Repository instances
         */
        this.guilds = null;
        this.captchas = null;
        this.logs = null;

    }

    /**
     * --------------------------------------------------------
     * Initialize
     * --------------------------------------------------------
     */

    initialize() {

        const directory = path.dirname(this.databasePath);

        if (!fs.existsSync(directory)) {

            fs.mkdirSync(directory, {
                recursive: true
            });

        }

        this.db = new DatabaseDriver(this.databasePath);

        /**
         * SQLite PRAGMAs
         */

        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.db.pragma("synchronous = NORMAL");

        this.createTables();
        this.migrateSchema();
        this.createIndexes();

        /**
         * Initialize repositories
         */

        this.guilds = new GuildRepository(this);

        this.captchas = new CaptchaRepository(this);

        this.logs = new LogRepository(this);

    }

    /**
     * --------------------------------------------------------
     * Schema
     * --------------------------------------------------------
     */

    createTables() {

        /**
         * Guild Settings
         */

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS guild_settings (

                guild_id TEXT PRIMARY KEY,

                verify_channel_id TEXT,

                verify_message_id TEXT,

                verified_role_id TEXT,

                verification_enabled INTEGER DEFAULT 1,

                log_channel_id TEXT,

                message_title TEXT DEFAULT 'Server Verification',

                message_description TEXT DEFAULT 'Complete the CAPTCHA below to gain access to the server.',

                message_color TEXT DEFAULT '#5865F2',

                button_label TEXT DEFAULT 'Verify',

                success_message TEXT DEFAULT 'You have been verified successfully.',

                captcha_length INTEGER DEFAULT 6,

                captcha_expiration_minutes INTEGER DEFAULT 5,

                max_attempts INTEGER DEFAULT 5,

                cooldown_seconds INTEGER DEFAULT 30,

                lockout_minutes INTEGER DEFAULT 10,

                captcha_difficulty TEXT DEFAULT 'MEDIUM',

                updated_by TEXT,

                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

            );
        `);

        /**
         * Active Captchas
         */

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS captchas (

            user_id TEXT,

            guild_id TEXT,

            captcha_id TEXT,

            captcha_hash TEXT,

            captcha_salt TEXT,

            attempts INTEGER DEFAULT 0,

            max_attempts INTEGER,

            created_at INTEGER,

            expires_at INTEGER,

            PRIMARY KEY(user_id, guild_id)

        );
        `);

        /**
         * Verification Logs
         */

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS verification_logs (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                guild_id TEXT,

                user_id TEXT,

                success INTEGER,

                failure_reason TEXT,

                timestamp INTEGER,

                ip_hash TEXT,
                
                attempts INTEGER,
                
                verification_duration INTEGER,
                
                bot_version TEXT

            );
        `);

    }

    migrateSchema() {

        const captchaColumns = this.db
            .prepare("PRAGMA table_info(captchas)")
            .all()
            .map(column => column.name);

        if (!captchaColumns.includes("captcha_hash")) {
            this.db.exec("ALTER TABLE captchas ADD COLUMN captcha_hash TEXT");
        }

        if (!captchaColumns.includes("captcha_salt")) {
            this.db.exec("ALTER TABLE captchas ADD COLUMN captcha_salt TEXT");
        }

        const guildColumns = new Set(this.db
            .prepare("PRAGMA table_info(guild_settings)")
            .all()
            .map(column => column.name));

        const additions = [
            ["message_title", "TEXT DEFAULT 'Server Verification'"],
            ["message_description", "TEXT DEFAULT 'Complete the CAPTCHA below to gain access to the server.'"],
            ["message_color", "TEXT DEFAULT '#5865F2'"],
            ["button_label", "TEXT DEFAULT 'Verify'"],
            ["success_message", "TEXT DEFAULT 'You have been verified successfully.'"],
            ["captcha_length", "INTEGER DEFAULT 6"],
            ["captcha_expiration_minutes", "INTEGER DEFAULT 5"],
            ["max_attempts", "INTEGER DEFAULT 5"],
            ["cooldown_seconds", "INTEGER DEFAULT 30"],
            ["lockout_minutes", "INTEGER DEFAULT 10"],
            ["captcha_difficulty", "TEXT DEFAULT 'MEDIUM'"],
            ["updated_by", "TEXT"]
        ];

        for (const [name, definition] of additions) {
            if (!guildColumns.has(name)) {
                this.db.exec(`ALTER TABLE guild_settings ADD COLUMN ${name} ${definition}`);
            }
        }

    }

    createIndexes() {

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_verification_logs_guild_timestamp
            ON verification_logs(guild_id, timestamp DESC);

            CREATE INDEX IF NOT EXISTS idx_captchas_expires_at
            ON captchas(expires_at);

            CREATE INDEX IF NOT EXISTS idx_verification_logs_guild_success_timestamp
            ON verification_logs(guild_id, success, timestamp DESC);
        `);

        this.db.pragma("optimize");

    }

    /**
     * --------------------------------------------------------
     * Generic Helpers
     * --------------------------------------------------------
     */

    run(sql, params = []) {

        return this.db.prepare(sql).run(...params);

    }

    get(sql, params = []) {

        return this.db.prepare(sql).get(...params);

    }

    all(sql, params = []) {

        return this.db.prepare(sql).all(...params);

    }

    transaction(callback) {

        return this.db.transaction(callback);

    }

    /**
     * --------------------------------------------------------
     * Health
     * --------------------------------------------------------
     */

    isConnected() {

        return this.db !== null;

    }

    /**
     * --------------------------------------------------------
     * Shutdown
     * --------------------------------------------------------
     */

    close() {

        if (!this.db) {

            return;

        }

        this.db.close();

        this.db = null;

    }

}

module.exports = Database;
