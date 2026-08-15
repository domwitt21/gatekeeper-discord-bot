/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Embed Factory
 *
 * Provides a consistent way to build embeds throughout
 * the application.
 *
 * Responsibilities:
 *  • Branding
 *  • Colors
 *  • Footer
 *  • Timestamp
 *  • Helper methods
 * ============================================================
 */

const {
    EmbedBuilder
} = require("discord.js");

const Theme = require("./Theme");

class EmbedFactory {

    /**
     * --------------------------------------------------------
     * Base Embed
     * --------------------------------------------------------
     *
     * @param {Object} options
     * @returns {EmbedBuilder}
     */
    static create(options = {}) {

        const embed = new EmbedBuilder()

            .setColor(
                options.color ??
                Theme.colors.primary
            )

            .setTimestamp();

        /**
         * Optional title
         */

        if (options.title) {

            embed.setTitle(options.title);

        }

        /**
         * Optional description
         */

        if (options.description) {

            embed.setDescription(
                options.description
            );

        }

        /**
         * Optional author
         */

        if (options.author) {

            embed.setAuthor(options.author);

        }

        /**
         * Optional thumbnail
         */

        if (options.thumbnail) {

            embed.setThumbnail(
                options.thumbnail
            );

        }

        /**
         * Optional image
         */

        if (options.image) {

            embed.setImage(
                options.image
            );

        }

        /**
         * Optional fields
         */

        if (
            Array.isArray(options.fields) &&
            options.fields.length > 0
        ) {

            embed.addFields(
                options.fields
            );

        }

        /**
         * Footer
         */

        embed.setFooter({

            text:
                options.footer ??
                Theme.brand.footer

        });

        return embed;

    }

    /**
     * --------------------------------------------------------
     * Success Embed
     * --------------------------------------------------------
     */

    static success(title, description) {

        return this.create({

            title:
                `${Theme.emojis.success} ${title}`,

            description,

            color:
                Theme.colors.success

        });

    }

    /**
     * --------------------------------------------------------
     * Error Embed
     * --------------------------------------------------------
     */

    static error(title, description) {

        return this.create({

            title:
                `${Theme.emojis.error} ${title}`,

            description,

            color:
                Theme.colors.error

        });

    }

    /**
     * --------------------------------------------------------
     * Warning Embed
     * --------------------------------------------------------
     */

    static warning(title, description) {

        return this.create({

            title:
                `${Theme.emojis.warning} ${title}`,

            description,

            color:
                Theme.colors.warning

        });

    }

    /**
     * --------------------------------------------------------
     * Info Embed
     * --------------------------------------------------------
     */

    static info(title, description) {

        return this.create({

            title:
                `${Theme.emojis.info} ${title}`,

            description,

            color:
                Theme.colors.info

        });

    }

    /**
     * --------------------------------------------------------
     * Neutral Embed
     * --------------------------------------------------------
     */

    static neutral(title, description) {

        return this.create({

            title,

            description,

            color:
                Theme.colors.neutral

        });

    }

}

module.exports = EmbedFactory;