/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Cooldown Handler
 *
 * Responsibilities:
 *  • Per-user cooldowns
 *  • Per-command tracking
 *  • Automatic cleanup
 *  • Owner bypass
 * ============================================================
 */

class CooldownHandler {

    /**
     * Active cooldowns.
     *
     * Structure:
     *
     * commandName
     *      ↓
     * Map(userId → expiresAt)
     */
    static cooldowns = new Map();

    /**
     * Validate command cooldown.
     *
     * Returns:
     *  • null if allowed
     *  • reply object if denied
     *
     * @param {Client} client
     * @param {ChatInputCommandInteraction} interaction
     * @param {Object} command
     * @returns {Object|null}
     */
    static async check(client, interaction, command) {

        const seconds = command.cooldown ?? 0;

        if (seconds <= 0) {

            return null;

        }

        /**
         * Owner bypass
         */

        if (
            command.ownerBypass !== false &&
            client.config.owner.id &&
            interaction.user.id === client.config.owner.id
        ) {

            return null;

        }

        const commandName = interaction.commandName;

        if (!this.cooldowns.has(commandName)) {

            this.cooldowns.set(
                commandName,
                new Map()
            );

        }

        const users =
            this.cooldowns.get(commandName);

        const now = Date.now();

        const expires =
            users.get(interaction.user.id);

        /**
         * Existing cooldown
         */

        if (expires && expires > now) {

            const remaining =
                ((expires - now) / 1000).toFixed(1);

            return {

                content:
                    `⏳ Please wait **${remaining} seconds** before using this command again.`,

                ephemeral: true

            };

        }

        /**
         * Apply cooldown
         */

        users.set(
            interaction.user.id,
            now + (seconds * 1000)
        );

        return null;

    }

    /**
     * Remove expired cooldowns.
     *
     * Can safely be called periodically.
     */
    static cleanup() {

        const now = Date.now();

        for (const [command, users] of this.cooldowns) {

            for (const [user, expires] of users) {

                if (expires <= now) {

                    users.delete(user);

                }

            }

            if (users.size === 0) {

                this.cooldowns.delete(command);

            }

        }

    }

    /**
     * Clear one user's cooldown.
     *
     * Useful for admin commands.
     */
    static clear(commandName, userId) {

        const users =
            this.cooldowns.get(commandName);

        if (!users) {

            return;

        }

        users.delete(userId);

    }

    /**
     * Clear every cooldown.
     *
     * Mainly useful during development.
     */
    static clearAll() {

        this.cooldowns.clear();

    }

}

module.exports = CooldownHandler;