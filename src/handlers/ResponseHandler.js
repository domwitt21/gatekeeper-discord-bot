/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Response Handler
 *
 * Provides a safe interface for Discord interactions.
 *
 * Responsibilities:
 *  • Reply
 *  • Edit replies
 *  • Follow up
 *  • Defer replies
 *  • Prevent duplicate acknowledgements
 * ============================================================
 */

class ResponseHandler {

    /**
     * Safely reply to an interaction.
     *
     * If the interaction has already been acknowledged,
     * automatically send a follow-up message instead.
     *
     * @param {Interaction} interaction
     * @param {Object} options
     */
    static async reply(interaction, options) {

        if (interaction.replied) {

            return interaction.followUp(options);

        }

        if (interaction.deferred) {

            return interaction.editReply(options);

        }

        return interaction.reply(options);

    }

    /**
     * Edit the original reply.
     *
     * @param {Interaction} interaction
     * @param {Object} options
     */
    static async edit(interaction, options) {

        if (!interaction.deferred && !interaction.replied) {

            return interaction.reply(options);

        }

        return interaction.editReply(options);

    }

    /**
     * Send a follow-up message.
     *
     * @param {Interaction} interaction
     * @param {Object} options
     */
    static async followUp(interaction, options) {

        if (!interaction.deferred && !interaction.replied) {

            return interaction.reply(options);

        }

        return interaction.followUp(options);

    }

    /**
     * Safely defer a reply.
     *
     * @param {Interaction} interaction
     * @param {Object} options
     */
    static async defer(interaction, options = {}) {

        if (
            interaction.deferred ||
            interaction.replied
        ) {

            return;

        }

        return interaction.deferReply(options);

    }

    /**
     * Reply with a success message.
     *
     * @param {Interaction} interaction
     * @param {string} message
     */
    static async success(interaction, message) {

        return this.reply(interaction, {

            content: `✅ ${message}`,

            ephemeral: true

        });

    }

    /**
     * Reply with an error message.
     *
     * @param {Interaction} interaction
     * @param {string} message
     */
    static async error(interaction, message) {

        return this.reply(interaction, {

            content: `❌ ${message}`,

            ephemeral: true

        });

    }

    /**
     * Reply with a warning message.
     *
     * @param {Interaction} interaction
     * @param {string} message
     */
    static async warning(interaction, message) {

        return this.reply(interaction, {

            content: `⚠️ ${message}`,

            ephemeral: true

        });

    }

    /**
     * Reply with an informational message.
     *
     * @param {Interaction} interaction
     * @param {string} message
     */
    static async info(interaction, message) {

        return this.reply(interaction, {

            content: `ℹ️ ${message}`,

            ephemeral: true

        });

    }

}

module.exports = ResponseHandler;