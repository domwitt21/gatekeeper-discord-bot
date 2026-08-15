/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Button Factory
 *
 * Creates standardized Discord buttons used throughout
 * the application.
 *
 * Responsibilities:
 *  • Consistent styling
 *  • Custom IDs
 *  • Emojis
 *  • Disabled states
 * ============================================================
 */

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Theme = require("./Theme");

class ButtonFactory {

    /**
     * --------------------------------------------------------
     * Internal Button Builder
     * --------------------------------------------------------
     *
     * @param {Object} options
     * @returns {ButtonBuilder}
     */
    static create(options = {}) {

        const button = new ButtonBuilder()

            .setCustomId(options.customId)

            .setStyle(
                options.style ??
                ButtonStyle.Primary
            )

            .setDisabled(
                options.disabled ?? false
            );

        if (options.label) {

            button.setLabel(options.label);

        }

        if (options.emoji) {

            button.setEmoji(options.emoji);

        }

        return button;

    }

    // static enterCaptcha(disabled = false) {

    //     return this.create({

    //         customId: "verify_captcha_enter",

    //         label: "Enter CAPTCHA",

    //         emoji: "🔑",

    //         style: ButtonStyle.Primary,

    //         disabled

    //     });

    // }

    /**
     * --------------------------------------------------------
     * Wrap Buttons In Action Row
     * --------------------------------------------------------
     *
     * @param {...ButtonBuilder} buttons
     * @returns {ActionRowBuilder}
     */
    static row(...buttons) {

        return new ActionRowBuilder().addComponents(
            ...buttons
        );

    }

    /**
     * --------------------------------------------------------
     * Verify Button
     * --------------------------------------------------------
     */

    static verify(disabled = false, label = Theme.verification.buttonLabel) {

        return this.create({

            customId: "verify_button",

            label,

            emoji:
                Theme.verification.buttonEmoji,

            style: ButtonStyle.Success,

            disabled

        });

    }

    /**
     * --------------------------------------------------------
     * Retry Button
     * --------------------------------------------------------
     */

    static retry(disabled = false) {

        return this.create({

            customId: "captcha_retry",

            label: "Retry",

            emoji: Theme.emojis.refresh,

            style: ButtonStyle.Primary,

            disabled

        });

    }

    /**
     * --------------------------------------------------------
     * Cancel Button
     * --------------------------------------------------------
     */

    static cancel(disabled = false) {

        return this.create({

            customId: "captcha_cancel",

            label: "Cancel",

            emoji: "✖️",

            style: ButtonStyle.Danger,

            disabled

        });

    }

    /**
     * --------------------------------------------------------
     * Disabled Verify Button
     * --------------------------------------------------------
     */

    static disabledVerify() {

        return this.verify(true);

    }

    /**
     * --------------------------------------------------------
     * Verification Action Row
     * --------------------------------------------------------
     */

    static verificationRow(options = {}) {

        return this.row(

            this.verify(options.disabled ?? false, options.label)

        );

    }

    /**
     * --------------------------------------------------------
     * Retry Action Row
     * --------------------------------------------------------
     */

    static retryRow() {

        return this.row(

            this.retry(),

            this.cancel()

        );

    }

}

module.exports = ButtonFactory;
