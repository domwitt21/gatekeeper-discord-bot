/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Interaction Create Event
 *
 * Handles:
 *
 * • Slash commands
 * • Verify buttons
 * • CAPTCHA buttons
 * • CAPTCHA modals
 *
 * ============================================================
 */


const VerificationManager =
    require("../managers/VerificationManager");
const CommandHandler = require("../handlers/CommandHandler");



module.exports = {


    name:

        "interactionCreate",



    async execute(interaction, client) {



        try {


            /**
             * =================================================
             * Slash Commands
             * =================================================
             */

            if (

                interaction.isChatInputCommand()

            ) {


                return CommandHandler.execute(client, interaction);


            }



            /**
             * =================================================
             * Verification Manager
             * =================================================
             */


            const verificationManager =

                client.verificationManager ||

                new VerificationManager({

                    client,

                    database:

                        client.database,

                    logger:

                        client.logger

                });



            /**
             * Save instance
             *
             * Prevents rebuilding
             * every interaction.
             */

            client.verificationManager =

                verificationManager;



            /**
             * =================================================
             * Verify Button
             * =================================================
             */

            if (
                interaction.isButton() &&
                interaction.customId === "verify_button"
            ) {

                try {

                    console.log("Button clicked");

                    return await verificationManager.beginVerification({

                        interaction,
                        guild: interaction.guild,
                        member: interaction.member

                    });

                }
                catch (err) {

                    console.error(err);

                    return;

                }

            }



            /**
             * =================================================
             * CAPTCHA Entry Button
             * =================================================
             */


            if (

                interaction.isButton()

                &&

                interaction.customId ===

                "verify_captcha_enter"

            ) {



                return (

                    await verificationManager.openCaptchaModal(

                        interaction

                    )

                );


            }



            /**
             * =================================================
             * CAPTCHA Modal Submit
             * =================================================
             */


            if (

                interaction.isModalSubmit()

                &&

                interaction.customId ===

                "verify_captcha_modal"

            ) {



                const result =

                    await verificationManager.handleCaptchaSubmission(

                        interaction

                    );



                if (

                    result?.success

                ) {



                    const member =

                        await interaction.guild.members.fetch(

                            interaction.user.id

                        );



                    return (

                        await verificationManager.completeVerification({

                            interaction,

                            member,

                            session:

                                result.session

                        })

                    );


                }


                return result;


            }



        }

        catch(error) {



            console.error(

                "Interaction Error:",

                error

            );



            /**
             * Prevent Discord timeout errors
             */

            if (

                interaction.deferred ||

                interaction.replied

            ) {


                return interaction.followUp({

                    content:

                        "❌ An unexpected error occurred.",

                    flags: MessageFlags.Ephemeral

                });


            }



            return interaction.reply({

                content:

                    "❌ An unexpected error occurred.",

                ephemeral:

                    true

            });


        }


    }


};
