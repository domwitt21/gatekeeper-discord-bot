/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * /ping
 *
 * Tests the command framework and reports the bot latency.
 * ============================================================
 */

const {
    SlashCommandBuilder
} = require("discord.js");

const CommandBuilder = require("../../builders/CommandBuilder");
const EmbedFactory = require("../../ui/EmbedFactory");
const ResponseHandler =
    require("../../handlers/ResponseHandler");

module.exports = CommandBuilder.create({

    category: "utility",

    cooldown: 5,

    data: new SlashCommandBuilder()

        .setName("ping")

        .setDescription(
            "Display the bot latency and API latency."
        ),

    /**
     * --------------------------------------------------------
     * Execute Command
     * --------------------------------------------------------
     */

    async execute(interaction, client) {

        /**
         * Time between interaction creation and execution.
         */
        const latency =
            Date.now() - interaction.createdTimestamp;

        /**
         * WebSocket heartbeat latency.
         */
        const apiLatency =
            Math.round(client.ws.ping);

        /**
         * Determine connection health.
         */

        let status = "Excellent";

        if (apiLatency >= 250) {

            status = "Poor";

        }
        else if (apiLatency >= 100) {

            status = "Good";

        }

        const embed = EmbedFactory.create({

            title: "🏓 Pong!",

            color: 0x57F287,

            fields: [

                {
                    name: "Bot Latency",
                    value: `\`${latency} ms\``,
                    inline: true
                },

                {
                    name: "API Latency",
                    value: `\`${apiLatency} ms\``,
                    inline: true
                },

                {
                    name: "Connection",
                    value: status,
                    inline: true
                }

            ]

        });

        await ResponseHandler.reply(interaction, {

            embeds: [

                embed

            ],

            ephemeral: true

        });

    }

});