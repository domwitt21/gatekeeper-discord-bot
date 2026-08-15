/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Theme
 *
 * Central location for branding, colors and UI constants.
 *
 * Changing this file updates the appearance of the
 * entire verification system.
 * ============================================================
 */

module.exports = Object.freeze({

    /**
     * --------------------------------------------------------
     * Brand
     * --------------------------------------------------------
     */

    brand: {

        name: "Gatekeeper",

        footer: "Powered by SecureBootLabs",

        version: "1.0.0"

    },

    /**
     * --------------------------------------------------------
     * Embed Colors
     * --------------------------------------------------------
     */

    colors: {

        primary: 0x5865F2,

        success: 0x57F287,

        error: 0xED4245,

        warning: 0xFEE75C,

        info: 0x5865F2,

        neutral: 0x2B2D31

    },

    /**
     * --------------------------------------------------------
     * Emojis
     * --------------------------------------------------------
     */

    emojis: {

        verify: "✅",

        success: "✅",

        error: "❌",

        warning: "⚠️",

        info: "ℹ️",

        lock: "🔒",

        shield: "🛡️",

        robot: "🤖",

        refresh: "🔄"

    },

    /**
     * --------------------------------------------------------
     * Verification Defaults
     * --------------------------------------------------------
     */

    verification: {

        buttonLabel: "Verify",

        buttonEmoji: "✅",

        buttonStyle: "Success"

    }

});