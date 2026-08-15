/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * /setupverify
 *
 * Creates or replaces the server verification message.
 * ============================================================
 */

const {

    SlashCommandBuilder,
    PermissionFlagsBits

} = require("discord.js");

const CommandBuilder = require("../../builders/CommandBuilder");
const ResponseHandler = require("../../handlers/ResponseHandler");
const VerificationManager = require("../../managers/VerificationManager");

module.exports = CommandBuilder.create({

    category: "admin",

    cooldown: 15,

    deferReply: true,

    permissions: [

        PermissionFlagsBits.ManageGuild,

        PermissionFlagsBits.ManageRoles

    ],

    botPermissions: [

        PermissionFlagsBits.SendMessages,

        PermissionFlagsBits.ManageMessages,

        PermissionFlagsBits.ManageRoles,

        PermissionFlagsBits.ViewChannel,

        PermissionFlagsBits.EmbedLinks

    ],

    data: new SlashCommandBuilder()

        .setName("setupverify")

        .setDescription(
            "Create or update the server verification system."
        )

        .addChannelOption(option =>

            option

                .setName("channel")

                .setDescription(
                    "Channel that will contain the verification message."
                )

                .setRequired(true)

        )

        .addRoleOption(option =>

            option

                .setName("verified-role")

                .setDescription(
                    "Role granted after successful verification."
                )

                .setRequired(true)

        )

        .addChannelOption(option =>

            option

                .setName("log-channel")

                .setDescription(
                    "Channel used for verification logs."
                )

                .setRequired(false)

        ),

    /**
     * --------------------------------------------------------
     * Execute
     * --------------------------------------------------------
     */

    async execute(interaction, client) {

        const verifyChannel =
            interaction.options.getChannel("channel");

        const verifiedRole =
            interaction.options.getRole("verified-role");

        const logChannel =
            interaction.options.getChannel("log-channel");

        try {

            const result =
                await VerificationManager.setup({

                    client,

                    guild: interaction.guild,

                    verifyChannel,

                    verifiedRole,

                    logChannel,

                    requestedBy: interaction.user

                });

            return ResponseHandler.success(

                interaction,

                result.message

            );

        }

        catch (error) {

            console.error(error);

            return ResponseHandler.error(

                interaction,

                error.message ||
                "Failed to configure the verification system."

            );

        }

    }

});