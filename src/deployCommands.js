/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Slash Command Deployment
 *
 * Responsibilities:
 *  • Discover every command
 *  • Validate commands
 *  • Detect duplicate names
 *  • Register commands with Discord
 * ============================================================
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
    REST,
    Routes
} = require("discord.js");

/**
 * ------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------
 */

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

/**
 * ------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------
 */

if (!TOKEN) {

    throw new Error(
        "Missing DISCORD_TOKEN"
    );

}

if (!CLIENT_ID) {

    throw new Error(
        "Missing CLIENT_ID"
    );

}

/**
 * ------------------------------------------------------------
 * Find Command Files
 * ------------------------------------------------------------
 */

function getCommandFiles(directory) {

    let files = [];

    const entries = fs.readdirSync(
        directory,
        {
            withFileTypes: true
        }
    );

    for (const entry of entries) {

        const fullPath = path.join(
            directory,
            entry.name
        );

        if (entry.isDirectory()) {

            files = files.concat(
                getCommandFiles(fullPath)
            );

            continue;

        }

        if (
            entry.isFile() &&
            entry.name.endsWith(".js")
        ) {

            files.push(fullPath);

        }

    }

    return files;

}

/**
 * ------------------------------------------------------------
 * Load Commands
 * ------------------------------------------------------------
 */

const commands = [];

const names = new Set();

const commandsPath = path.join(
    __dirname,
    "commands"
);

const files = getCommandFiles(
    commandsPath
);

console.log("");

console.log("========== Deploy Commands ==========");

for (const file of files) {

    try {

        delete require.cache[
            require.resolve(file)
        ];

        const command = require(file);

        /**
         * Validation
         */

        if (!command.data) {

            throw new Error(
                "Missing data"
            );

        }

        if (!command.execute) {

            throw new Error(
                "Missing execute()"
            );

        }

        const json = command.data.toJSON();

        if (names.has(json.name)) {

            throw new Error(
                `Duplicate command "${json.name}"`
            );

        }

        names.add(json.name);

        commands.push(json);

        console.log(
            `✓ ${json.name}`
        );

    }
    catch (error) {

        console.error("");

        console.error(
            `✗ ${path.basename(file)}`
        );

        console.error(
            error.message
        );

    }

}

console.log("");

console.log(
    `Discovered ${commands.length} command(s).`
);

/**
 * ------------------------------------------------------------
 * Discord REST
 * ------------------------------------------------------------
 */

const rest = new REST({

    version: "10"

}).setToken(TOKEN);

/**
 * ------------------------------------------------------------
 * Deploy
 * ------------------------------------------------------------
 */

(async () => {

    try {

        console.log("");

        if (GUILD_ID) {

            console.log(
                "Deploying Guild Commands..."
            );

            await rest.put(

                Routes.applicationGuildCommands(

                    CLIENT_ID,

                    GUILD_ID

                ),

                {

                    body: commands

                }

            );

        }

        else {

            console.log(
                "Deploying Global Commands..."
            );

            await rest.put(

                Routes.applicationCommands(

                    CLIENT_ID

                ),

                {

                    body: commands

                }

            );

        }

        console.log("");

        console.log(
            "======================================"
        );

        console.log(
            "Deployment Complete"
        );

        console.log(
            `Registered ${commands.length} command(s).`
        );

        console.log(
            "======================================"
        );

        console.log("");

    }

    catch (error) {

        console.error("");

        console.error(
            "Deployment Failed"
        );

        console.error(error);

    }

})();