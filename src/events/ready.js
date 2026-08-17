/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Ready Event
 *
 * Runs once when the bot successfully connects to Discord.
 *
 * Responsibilities:
 *  • Set bot presence
 *  • Display startup information
 *  • Verify startup state
 * ============================================================
 */

const {
    ActivityType,
    Events
} = require("discord.js");

const packageJson = require("../../package.json");
const SecurityReportService = require("../services/SecurityReportService");
const ReverificationService = require("../services/ReverificationService");

module.exports = {

    name: Events.ClientReady,

    once: true,

    enabled: true,

    /**
     * @param {Client} client
     */
    async execute(client) {

        try {

            /**
             * --------------------------------------------
             * Set Presence
             * --------------------------------------------
             */

            client.user.setPresence({

                status: client.config.discord.status,

                activities: [

                    {
                        name: client.config.discord.activity,
                        type: ActivityType.Watching
                    }

                ]

            });

            /**
             * --------------------------------------------
             * Console Banner
             * --------------------------------------------
             */

            console.log("");
            console.log("======================================");
            console.log(" Discord Verification Bot");
            console.log("======================================");
            console.log(` Bot Name      : ${client.user.tag}`);
            console.log(` Version       : ${packageJson.version}`);
            console.log(` Node Version  : ${process.version}`);
            console.log(` Discord.js    : v${require("discord.js").version}`);
            console.log(` Guilds        : ${client.guilds.cache.size}`);
            console.log(` Users Cached  : ${client.users.cache.size}`);
            console.log(` Commands      : ${client.commands.size}`);
            console.log(` Database      : Connected`);
            console.log(` Environment   : ${client.config.runtime.development ? "Development" : "Production"}`);
            console.log("======================================");
            console.log("");
            console.log("✅ Bot is online and ready.");
            console.log("");

            client.securityReportService = client.securityReportService || new SecurityReportService(client);
            client.securityReportService.start();
            client.reverificationService = client.reverificationService || new ReverificationService(client);
            client.reverificationService.start();

        }
        catch (error) {

            console.error("");

            console.error("Ready Event Error");

            console.error(error);

        }

    }

};
