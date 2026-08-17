/**
 * ============================================================
 * Discord Verification Bot
 * ============================================================
 *
 * Application Entry Point
 *
 * Responsibilities:
 *  • Create Discord Client
 *  • Load configuration
 *  • Initialize database
 *  • Load commands
 *  • Load events
 *  • Login to Discord
 *
 * ============================================================
 */

const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection
} = require("discord.js");

const config = require("./config");

const loadCommands = require("./utils/CommandLoader");
const loadEvents = require("./utils/EventLoader");

const Database = require("./database/Database");
const DashboardServer = require("./dashboard/DashboardServer");

/**
 * ------------------------------------------------------------
 * Discord Client
 * ------------------------------------------------------------
 */

const client = new Client({

    intents: [

        GatewayIntentBits.Guilds,

        GatewayIntentBits.GuildMembers,

        GatewayIntentBits.GuildMessages

    ],

    partials: [

        Partials.Channel

    ]

});

/**
 * ------------------------------------------------------------
 * Collections
 * ------------------------------------------------------------
 */

client.commands = new Collection();

client.cooldowns = new Collection();

client.captchas = new Collection();

/**
 * ------------------------------------------------------------
 * Managers
 * ------------------------------------------------------------
 */

client.config = config;

client.database = new Database(config.database);

/**
 * ------------------------------------------------------------
 * Startup
 * ------------------------------------------------------------
 */

(async () => {

    try {

        console.log("");

        console.log("======================================");
        console.log(" Discord Verification Bot");
        console.log("======================================");

        console.log("Loading database...");

        await client.database.initialize();

        console.log("Loading commands...");

        await loadCommands(client);

        console.log("Loading events...");

        await loadEvents(client);

        console.log("Logging into Discord...");

        await client.login(config.discord.token);

        if (config.dashboard.enabled) {
            client.dashboard = new DashboardServer(client, config.dashboard);
            await client.dashboard.start();
        }

    }
    catch (error) {

        console.error("");

        console.error("Startup Failed");

        console.error(error);

        process.exit(1);

    }

})();

/**
 * ------------------------------------------------------------
 * Graceful Shutdown
 * ------------------------------------------------------------
 */

async function shutdown(signal) {

    console.log("");

    console.log(`${signal} received.`);

    console.log("Closing database...");

    try {

        if (client.dashboard) {
            await client.dashboard.stop();
        }

        client.securityReportService?.stop();
        client.reverificationService?.stop();
        client.configurationHealthService?.stop();
        client.onboardingService?.stop();

        if (client.database) {

            await client.database.close();

        }

        client.destroy();

        console.log("Shutdown complete.");

        process.exit(0);

    }
    catch (error) {

        console.error(error);

        process.exit(1);

    }

}

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));

/**
 * ------------------------------------------------------------
 * Unexpected Errors
 * ------------------------------------------------------------
 */

process.on("unhandledRejection", error => {

    console.error("Unhandled Promise Rejection");

    console.error(error);

});

process.on("uncaughtException", error => {

    console.error("Uncaught Exception");

    console.error(error);

});

process.on("uncaughtExceptionMonitor", error => {

    console.error("Exception Monitor");

    console.error(error);

});
