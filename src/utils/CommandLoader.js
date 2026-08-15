/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Command Loader
 *
 * Automatically loads every command inside the commands
 * directory and any nested subdirectories.
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

/**
 * Recursively find all JavaScript files.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function getCommandFiles(directory) {

    let files = [];

    const entries = fs.readdirSync(directory, {
        withFileTypes: true
    });

    for (const entry of entries) {

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {

            files = files.concat(
                getCommandFiles(fullPath)
            );

            continue;

        }

        if (entry.isFile() && entry.name.endsWith(".js")) {

            files.push(fullPath);

        }

    }

    return files;

}

/**
 * Load every command into client.commands
 *
 * @param {Client} client
 */
async function loadCommands(client) {

    const commandsPath = path.join(__dirname, "..", "commands");

    if (!fs.existsSync(commandsPath)) {

        console.warn("");

        console.warn("Commands directory does not exist.");

        return;

    }

    const commandFiles = getCommandFiles(commandsPath);

    let loaded = 0;

    let failed = 0;

    console.log("");

    console.log("========== Loading Commands ==========");

    for (const file of commandFiles) {

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
                    "Missing command.data"
                );

            }

            if (!command.execute) {

                throw new Error(
                    "Missing command.execute()"
                );

            }

            client.commands.set(
                command.data.name,
                command
            );

            loaded++;

            console.log(
                `✓ ${command.data.name}`
            );

        }
        catch (error) {

            failed++;

            console.error("");

            console.error(
                `✗ Failed to load ${path.basename(file)}`
            );

            console.error(error.message);

        }

    }

    console.log("");

    console.log(
        `Loaded ${loaded} command(s).`
    );

    if (failed > 0) {

        console.log(
            `${failed} command(s) failed.`
        );

    }

    console.log("======================================");

}

module.exports = loadCommands;