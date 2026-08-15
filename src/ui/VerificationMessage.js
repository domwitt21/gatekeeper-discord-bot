/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Verification Message
 *
 * Builds the complete verification interface.
 *
 * Responsibilities:
 *  • Verification embed
 *  • Verify button
 *  • Future branding
 * ============================================================
 */

const EmbedFactory = require("./EmbedFactory");
const ButtonFactory = require("./ButtonFactory");
const Theme = require("./Theme");

class VerificationMessage {

    /**
     * --------------------------------------------------------
     * Default Verification Message
     * --------------------------------------------------------
     *
     * @returns {Object}
     */
    static create(options = {}) {

        const enabled = options.enabled !== false;

        const embed = EmbedFactory.create({

            color: options.color ?? Theme.colors.primary,

            title: options.title ?? `${Theme.emojis.shield} Server Verification`,

            description: options.description ?? [
                "Welcome!",
                "",
                "To gain access to the server, you must complete a quick verification.",
                "",
                "### What happens next?",
                "• Click the **Verify** button below.",
                "• A private verification window will open.",
                "• Complete the CAPTCHA.",
                "• You'll automatically receive access if successful.",
                "",
                "**This helps protect the server from bots and spam accounts.**"
            ].join("\n")

        });

        return {

            embeds: [

                embed

            ],

            components: [

                ButtonFactory.verificationRow({
                    disabled: !enabled,
                    label: options.buttonLabel ?? Theme.verification.buttonLabel
                })

            ]

        };

    }

    /**
     * --------------------------------------------------------
     * Disabled Verification Message
     * --------------------------------------------------------
     *
     * Used during maintenance or setup.
     *
     * @returns {Object}
     */
    static disabled() {

        const embed = EmbedFactory.warning(

            "Verification Unavailable",

            "Verification is temporarily disabled. Please try again later."

        );

        return {

            embeds: [

                embed

            ],

            components: [

                ButtonFactory.row(

                    ButtonFactory.disabledVerify()

                )

            ]

        };

    }

    /**
     * --------------------------------------------------------
     * Maintenance Message
     * --------------------------------------------------------
     *
     * @returns {Object}
     */
    static maintenance() {

        const embed = EmbedFactory.info(

            "Verification Offline",

            "The verification system is currently undergoing maintenance."

        );

        return {

            embeds: [

                embed

            ],

            components: [

                ButtonFactory.row(

                    ButtonFactory.disabledVerify()

                )

            ]

        };

    }

}

module.exports = VerificationMessage;
