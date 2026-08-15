/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Central Configuration
 *
 * Loads all environment variables and exports a single,
 * immutable configuration object for use throughout the app.
 * ============================================================
 */

const path = require("path");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

/**
 * Helper function for reading environment variables.
 *
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value if not provided
 * @returns {*}
 */
function env(key, defaultValue = undefined) {
    return process.env[key] ?? defaultValue;
}

/**
 * Helper function for converting values to integers.
 *
 * @param {string} key
 * @param {number} defaultValue
 * @returns {number}
 */
function intEnv(key, defaultValue) {
    const value = parseInt(env(key, defaultValue), 10);
    return Number.isNaN(value) ? defaultValue : value;
}

/**
 * Required environment variables.
 */
const required = [
    "DISCORD_TOKEN",
    "CLIENT_ID"
];

for (const variable of required) {
    if (!process.env[variable]) {
        throw new Error(
            `Missing required environment variable: ${variable}`
        );
    }
}

/**
 * Main Configuration Object
 */
const config = Object.freeze({

    /**
     * Discord Settings
     */
    discord: {

        token: env("DISCORD_TOKEN"),

        clientId: env("CLIENT_ID"),

        guildId: env("GUILD_ID", ""),

        status: env("BOT_STATUS", "online"),

        activity: env(
            "BOT_ACTIVITY",
            "Protecting your community"
        )

    },

    /**
     * Database
     */
    database: {

        path: path.resolve(
            env(
                "DATABASE_PATH",
                "./data/verification.sqlite"
            )
        )

    },

    /**
     * Verification
     */
    verification: {

        captchaLength: intEnv(
            "CAPTCHA_LENGTH",
            5
        ),

        expirationMinutes: intEnv(
            "CAPTCHA_EXPIRATION_MINUTES",
            2
        ),

        maxAttempts: intEnv(
            "MAX_CAPTCHA_ATTEMPTS",
            3
        ),

        cooldownSeconds: intEnv(
            "VERIFY_COOLDOWN_SECONDS",
            30
        ),

        lockoutMinutes: intEnv(
            "LOCKOUT_MINUTES",
            10
        ),

        difficulty: env(
            "CAPTCHA_DIFFICULTY",
            "MEDIUM"
        ),

        theme: env(
            "CAPTCHA_THEME",
            "DEFAULT"
        )

    },

    /**
     * Embed Colors
     */
    colors: {

        primary: env(
            "DEFAULT_EMBED_COLOR",
            "#0099ff"
        ),

        success: env(
            "SUCCESS_COLOR",
            "#57F287"
        ),

        error: env(
            "ERROR_COLOR",
            "#ED4245"
        ),

        warning: env(
            "WARNING_COLOR",
            "#FEE75C"
        )

    },

    /**
     * Logging
     */
    logging: {

        level: env(
            "LOG_LEVEL",
            "info"
        )

    },

    /**
     * Runtime
     */
    runtime: {

        development:
            env("NODE_ENV", "development") === "development"

    },

    cleanupIntervalSeconds: intEnv(
        "CLEANUP_INTERVAL_SECONDS",
        60
    ),

    owner: {
        id: env("BOT_OWNER_ID", "")
    },

    dashboard: {
        enabled: env("DASHBOARD_ENABLED", "true") === "true",
        host: env("DASHBOARD_HOST", "127.0.0.1"),
        port: intEnv("DASHBOARD_PORT", 3100),
        baseUrl: env("DASHBOARD_BASE_URL", "http://localhost:3100"),
        clientSecret: env("DISCORD_CLIENT_SECRET", ""),
        sessionSecret: env("DASHBOARD_SESSION_SECRET", "")
    },

    branding: {
        name: "SecureBootLabs Verification",
        footer: "Powered by SecureBootLabs",
        primaryColor: 0x5865F2
    }

});

module.exports = config;
