/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Event Loader
 *
 * Automatically discovers and registers all Discord events
 * from the events directory (including subfolders).
 *
 * Supports:
 *  • Recursive loading
 *  • Validation
 *  • client.on()
 *  • client.once()
 *  • Future metadata
 * ============================================================
 */

const fs = require("fs");
const path = require("path");

/**
 * Recursively collect every JavaScript file.
 *
 * @param {string} directory
 * @returns {string[]}
 */
function getEventFiles(directory) {

    let files = [];

    const entries = fs.readdirSync(directory, {
        withFileTypes: true
    });

    for (const entry of entries) {

        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {

            files = files.concat(
                getEventFiles(fullPath)
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
 * Register all events.
 *
 * @param {Client} client
 */
async function loadEvents(client) {

    const eventsPath = path.join(__dirname, "..", "events");

    if (!fs.existsSync(eventsPath)) {

        console.warn("");

        console.warn("Events directory does not exist.");

        return;

    }

    const eventFiles = getEventFiles(eventsPath);

    let loaded = 0;

    let failed = 0;

    console.log("");

    console.log("=========== Loading Events ===========");

    for (const file of eventFiles) {

        try {

            delete require.cache[
                require.resolve(file)
            ];

            const event = require(file);

            /**
             * Validation
             */

            if (!event.name) {

                throw new Error(
                    "Missing event.name"
                );

            }

            if (typeof event.execute !== "function") {

                throw new Error(
                    "Missing event.execute()"
                );

            }

            /**
             * Optional flag
             */

            if (event.enabled === false) {

                console.log(
                    `- Skipped ${event.name} (disabled)`
                );

                continue;

            }

            /**
             * Register event
             */

            if (event.once) {

                client.once(
                    event.name,
                    (...args) => event.execute(...args, client)
                );

            } else {

                client.on(
                    event.name,
                    (...args) => event.execute(...args, client)
                );

            }

            loaded++;

            console.log(
                `✓ ${event.name}`
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
        `Loaded ${loaded} event(s).`
    );

    if (failed > 0) {

        console.log(
            `${failed} event(s) failed.`
        );

    }

    console.log("======================================");

}

module.exports = loadEvents;