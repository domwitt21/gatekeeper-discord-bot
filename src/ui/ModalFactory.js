/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Modal Factory
 *
 * Creates standardized Discord modals used throughout
 * the application.
 *
 * Responsibilities:
 *  • Consistent modal styling
 *  • Standardized custom IDs
 *  • Text input creation
 *  • Verification CAPTCHA modal
 * ============================================================
 */

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const Theme = require("./Theme");

class ModalFactory {

    /**
     * --------------------------------------------------------
     * Base Text Input
     * --------------------------------------------------------
     *
     * @param {Object} options
     * @returns {TextInputBuilder}
     */
    static input(options = {}) {

        const input = new TextInputBuilder()

            .setCustomId(options.customId)

            .setLabel(options.label)

            .setStyle(
                options.style ??
                TextInputStyle.Short
            )

            .setRequired(
                options.required ?? true
            );

        if (options.placeholder) {

            input.setPlaceholder(
                options.placeholder
            );

        }

        if (options.value) {

            input.setValue(
                options.value
            );

        }

        if (options.minLength !== undefined) {

            input.setMinLength(
                options.minLength
            );

        }

        if (options.maxLength !== undefined) {

            input.setMaxLength(
                options.maxLength
            );

        }

        return input;

    }

    /**
     * --------------------------------------------------------
     * Base Modal
     * --------------------------------------------------------
     *
     * @param {Object} options
     * @returns {ModalBuilder}
     */
    static create(options = {}) {

        const modal = new ModalBuilder()

            .setCustomId(options.customId)

            .setTitle(options.title);

        if (
            Array.isArray(options.components) &&
            options.components.length > 0
        ) {

            modal.addComponents(
                ...options.components
            );

        }

        return modal;

    }

    /**
     * --------------------------------------------------------
     * Verification CAPTCHA Modal
     * --------------------------------------------------------
     *
     * @param {string} captchaId
     * @returns {ModalBuilder}
     */
    static verificationCaptcha(captchaId) {

        const captchaInput = this.input({

            customId: "captcha_answer",

            label: "Enter the CAPTCHA",

            placeholder: "Type the characters exactly as shown",

            minLength: 4,

            maxLength: 12

        });

        const row = new ActionRowBuilder()

            .addComponents(captchaInput);

        return this.create({

            customId: `verification:submit:${captchaId}`,

            title: `${Theme.emojis.lock} Verification`,

            components: [

                row

            ]

        });

    }

    /**
     * --------------------------------------------------------
     * Generic Single Input Modal
     * --------------------------------------------------------
     *
     * Useful for future admin tools.
     *
     * @param {Object} options
     * @returns {ModalBuilder}
     */
    static singleInput(options = {}) {

        const input = this.input({

            customId: options.inputId,

            label: options.label,

            placeholder: options.placeholder,

            required: options.required,

            minLength: options.minLength,

            maxLength: options.maxLength,

            style:
                options.style ??
                TextInputStyle.Short

        });

        const row = new ActionRowBuilder()

            .addComponents(input);

        return this.create({

            customId: options.customId,

            title: options.title,

            components: [

                row

            ]

        });

    }

}

module.exports = ModalFactory;