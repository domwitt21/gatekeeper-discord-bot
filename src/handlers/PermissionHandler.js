/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Permission Handler
 *
 * Centralized permission validation for slash commands.
 *
 * Responsibilities:
 *  • User permissions
 *  • Bot permissions
 *  • Guild checks
 *  • Future role policies
 * ============================================================
 */

const {
    PermissionsBitField
} = require("discord.js");

class PermissionHandler {

    /**
     * Validate whether a command can execute.
     *
     * Returns:
     *  • null when successful
     *  • reply object when denied
     *
     * @param {ChatInputCommandInteraction} interaction
     * @param {Object} command
     * @returns {Object|null}
     */
    static async check(interaction, command) {

        /**
         * --------------------------------------------
         * DM Validation
         * --------------------------------------------
         */

        if (!interaction.guild) {

            if (command.guildOnly !== false) {

                return {

                    content:
                        "❌ This command can only be used inside a server.",

                    ephemeral: true

                };

            }

            return null;

        }

        /**
         * --------------------------------------------
         * User Permissions
         * --------------------------------------------
         */

        if (
            Array.isArray(command.permissions) &&
            command.permissions.length > 0
        ) {

            const memberPermissions =
                interaction.member.permissions;

            const missing =
                command.permissions.filter(permission =>

                    !memberPermissions.has(permission)

                );

            if (missing.length > 0) {

                return {

                    content:
                        "❌ You do not have permission to use this command.",

                    ephemeral: true

                };

            }

        }

        /**
         * --------------------------------------------
         * Bot Permissions
         * --------------------------------------------
         */

        if (
            Array.isArray(command.botPermissions) &&
            command.botPermissions.length > 0
        ) {

            const botMember =
                interaction.guild.members.me;

            if (!botMember) {

                return {

                    content:
                        "❌ Unable to determine the bot's permissions.",

                    ephemeral: true

                };

            }

            const missing =
                command.botPermissions.filter(permission =>

                    !botMember.permissions.has(permission)

                );

            if (missing.length > 0) {

                return {

                    content:
                        `❌ I am missing the required permission(s): ${this.formatPermissions(missing)}.`,

                    ephemeral: true

                };

            }

        }

        return null;

    }

    /**
     * --------------------------------------------
     * Convert permissions into readable text.
     * --------------------------------------------
     *
     * @param {Array} permissions
     * @returns {string}
     */
    static formatPermissions(permissions) {

        return permissions

            .map(permission =>

                permission
                    .toString()
                    .replace(/_/g, " ")

            )

            .join(", ");

    }

}

module.exports = PermissionHandler;