/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Command Builder
 *
 * Provides a standardized way to define commands.
 *
 * Responsibilities:
 *  • Apply defaults
 *  • Validate commands
 *  • Freeze definitions
 * ============================================================
 */

class CommandBuilder {

    /**
     * Create a command definition.
     *
     * @param {Object} options
     * @returns {Object}
     */
    static create(options = {}) {

        if (!options.data) {

            throw new Error(
                "Command is missing 'data'."
            );

        }

        if (typeof options.execute !== "function") {

            throw new Error(
                "Command is missing execute()."
            );

        }

        const command = {

            /**
             * Discord SlashCommandBuilder
             */
            data: options.data,

            /**
             * Category
             */
            category:
                options.category ??
                "general",

            /**
             * Cooldown (seconds)
             */
            cooldown:
                options.cooldown ??
                0,

            /**
             * Command permissions
             */
            permissions:
                options.permissions ??
                [],

            /**
             * Bot permissions
             */
            botPermissions:
                options.botPermissions ??
                [],

            /**
             * Restrict to guilds
             */
            guildOnly:
                options.guildOnly ??
                true,

            /**
             * Restrict to bot owner
             */
            ownerOnly:
                options.ownerOnly ??
                false,

            /**
             * Owner bypasses cooldown
             */
            ownerBypass:
                options.ownerBypass ??
                true,

            /**
             * Automatically defer
             */
            deferReply:
                options.deferReply ??
                false,

            /**
             * Ephemeral replies
             */
            ephemeral:
                options.ephemeral ??
                true,

            /**
             * Allow autocomplete
             */
            autocomplete:
                options.autocomplete ??
                null,

            /**
             * Command execution
             */
            execute:
                options.execute

        };

        return Object.freeze(command);

    }

}

module.exports = CommandBuilder;