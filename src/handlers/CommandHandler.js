/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Command Handler
 *
 * Central router for all slash commands.
 *
 * Responsibilities:
 *  • Locate command
 *  • Validate execution requirements
 *  • Run permission checks
 *  • Run cooldown checks
 *  • Execute command
 *  • Handle errors
 * ============================================================
 */

const PermissionHandler = require("./PermissionHandler");
const CooldownHandler = require("./CooldownHandler");
const ResponseHandler = require("./ResponseHandler");

class CommandHandler {

    /**
     * Execute a slash command.
     *
     * @param {Client} client
     * @param {ChatInputCommandInteraction} interaction
     */
    static async execute(client, interaction) {

        const command = client.commands.get(
            interaction.commandName
        );

        if (!command) {

            console.warn(
                `Unknown command: ${interaction.commandName}`
            );

            return;

        }

        try {

            /**
             * --------------------------------------------------
             * Guild Only
             * --------------------------------------------------
             */

            if (command.guildOnly && !interaction.guild) {

                return ResponseHandler.reply(
                    interaction,
                    {
                        content:
                            "❌ This command can only be used inside a server.",
                        ephemeral: true
                    }
                );

            }

            /**
             * --------------------------------------------------
             * Owner Only
             * --------------------------------------------------
             */

            if (command.ownerOnly) {

                const ownerId = client.config.owner.id;

                if (
                    !ownerId ||
                    interaction.user.id !== ownerId
                ) {

                    return ResponseHandler.reply(
                        interaction,
                        {
                            content:
                                "❌ This command is restricted to the bot owner.",
                            ephemeral: true
                        }
                    );

                }

            }

            /**
             * --------------------------------------------------
             * Permission Checks
             * --------------------------------------------------
             */

            const permissionError =
                await PermissionHandler.check(
                    interaction,
                    command
                );

            if (permissionError) {

                return ResponseHandler.reply(
                    interaction,
                    permissionError
                );

            }

            /**
             * --------------------------------------------------
             * Cooldown Checks
             * --------------------------------------------------
             */

            const cooldownError =
                await CooldownHandler.check(
                    client,
                    interaction,
                    command
                );

            if (cooldownError) {

                return ResponseHandler.reply(
                    interaction,
                    cooldownError
                );

            }

            /**
             * --------------------------------------------------
             * Deferred Replies
             * --------------------------------------------------
             */

            if (command.deferReply) {

                await interaction.deferReply({

                    ephemeral:
                        command.ephemeral ?? false

                });

            }

            /**
             * --------------------------------------------------
             * Execute Command
             * --------------------------------------------------
             */

            await command.execute(
                interaction,
                client
            );

        }

        catch (error) {

            console.error("");

            console.error(
                `Command Error (${interaction.commandName})`
            );

            console.error(error);

            return ResponseHandler.reply(
                interaction,
                {
                    content:
                        "❌ An unexpected error occurred while executing this command.",
                    ephemeral: true
                }
            );

        }

    }

}

module.exports = CommandHandler;