/**
 * ============================================================
 * Discord Verification Bot
 * ------------------------------------------------------------
 * Verification Manager
 *
 * Central service responsible for the complete verification
 * lifecycle.
 *
 * Responsibilities
 * ------------------------------------------------------------
 * • Configure verification
 * • Create verification messages
 * • Handle button interactions
 * • Launch CAPTCHA modals
 * • Verify CAPTCHA responses
 * • Assign roles
 * • Log verification events
 * • Cleanup expired sessions
 * ============================================================
 */

const {

    ChannelType,

    ActionRowBuilder,

    ButtonBuilder,

    ButtonStyle,

    ModalBuilder,

    TextInputBuilder,

    TextInputStyle

} = require("discord.js");

const VerificationMessage = require("../ui/VerificationMessage");
const EmbedFactory = require("../ui/EmbedFactory");
const CaptchaService =
    require("../services/CaptchaService");
const AccountRiskService = require("../services/AccountRiskService");
const TrustPolicyService = require("../services/TrustPolicyService");
const VerificationPresetService = require("../services/VerificationPresetService");

class VerificationManager {

    /**
     * ========================================================
     * Configure Verification
     * ========================================================
     *
     * Creates or replaces the verification message for a guild.
     *
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    static async setup(options = {}) {

        const {

            client,

            guild,

            verifyChannel,

            verifiedRole,

            logChannel,
            requestedBy,

            messageSettings

        } = options;

        /**
         * ----------------------------------------------------
         * Validate required objects
         * ----------------------------------------------------
         */

        if (!client) {

            throw new Error(
                "Client was not provided."
            );

        }

        if (!guild) {

            throw new Error(
                "Guild was not provided."
            );

        }

        if (!verifyChannel) {

            throw new Error(
                "Verification channel is required."
            );

        }

        if (!verifiedRole) {

            throw new Error(
                "Verified role is required."
            );

        }

        /**
         * ----------------------------------------------------
         * Validate channel types
         * ----------------------------------------------------
         */

        const validChannelTypes = [

            ChannelType.GuildText,

            ChannelType.GuildAnnouncement

        ];

        if (

            !validChannelTypes.includes(
                verifyChannel.type
            )

        ) {

            throw new Error(
                "The verification channel must be a text channel."
            );

        }

        if (

            logChannel &&
            !validChannelTypes.includes(
                logChannel.type
            )

        ) {

            throw new Error(
                "The log channel must be a text channel."
            );

        }

        /**
         * ----------------------------------------------------
         * Validate bot permissions
         * ----------------------------------------------------
         */

        const botMember = guild.members.me;

        if (!botMember) {

            throw new Error(
                "Unable to determine the bot member."
            );

        }

        /**
         * Execute the verification setup workflow.
         */

        return this.performSetup({

            client,

            guild,

            verifyChannel,

            verifiedRole,

            logChannel,

            requestedBy,
            botMember,

            messageSettings

        });

    }

    /**
     * ========================================================
     * Validate Channel Permissions
     * ========================================================
     *
     * Ensures the bot has all required permissions
     * in the supplied channel.
     *
     * @private
     */
    static validateChannelPermissions(
        channel,
        botMember,
        requireManageMessages = true
    ) {

        const permissions = channel.permissionsFor(botMember);

        if (!permissions) {

            throw new Error(
                `Unable to determine bot permissions for #${channel.name}.`
            );

        }

        const requiredPermissions = [

            "ViewChannel",

            "SendMessages",

            "EmbedLinks"

        ];

        if (requireManageMessages) {

            requiredPermissions.push(

                "ManageMessages"

            );

        }

        const missing = requiredPermissions.filter(

            permission => !permissions.has(permission)

        );

        if (missing.length > 0) {

            throw new Error(

                `The bot is missing the following permissions in #${channel.name}: ${missing.join(", ")}`

            );

        }

    }

    /**
     * ========================================================
     * Main Setup Workflow
     * ========================================================
     *
     * This method orchestrates the setup process.
     *
     * The implementation will be completed in Part 2.
     *
     * @private
     */
        /**
     * ========================================================
     * Main Setup Workflow
     * ========================================================
     */

    static async performSetup(options) {

        const {

            client,
            guild,
            verifyChannel,
            verifiedRole,
            logChannel,
            requestedBy,
            botMember,
            messageSettings

        } = options;

        /**
         * Validate channel permissions.
         */

        this.validateChannelPermissions(
            verifyChannel,
            botMember
        );

        if (logChannel) {

            this.validateChannelPermissions(
                logChannel,
                botMember,
                false
            );

        }

        /**
         * Load previous configuration.
         */

        const existingConfig =
            await this.loadExistingConfiguration(
                client,
                guild.id
            );

        /**
         * Remove previous verification message.
         */

        await this.removeExistingVerification(
            client,
            existingConfig
        );

        /**
         * Create verification message.
         */

        const verificationMessage =
            await this.createVerificationMessage(
                verifyChannel,
                messageSettings
            );

        /**
         * Pin verification message.
         */

        await this.pinVerificationMessage(
            verificationMessage
        );

        /**
         * Persist configuration.
         */

        await this.saveConfiguration({

            client,

            guildId: guild.id,

            verifyChannelId: verifyChannel.id,

            verifyMessageId: verificationMessage.id,

            verifiedRoleId: verifiedRole.id,

            logChannelId:
                logChannel?.id ?? null,

            updatedBy:
                requestedBy.id

        });

        return {

            success: true,

            guildId: guild.id,

            verificationMessageId:
                verificationMessage.id,

            configuration:
                existingConfig,

            message:
                `Verification has been configured in ${verifyChannel}.`

        };

    }

    /**
     * ========================================================
     * Load Existing Configuration
     * ========================================================
     */

    static async loadExistingConfiguration(client, guildId) {


        const settings =
            await client.database.guilds.getSettings(guildId);


        return settings;

    }

    /**
     * ========================================================
     * Remove Previous Verification
     * ========================================================
     */

    static async removeExistingVerification(
        client,
        configuration
    ) {

        if (!configuration) {

            return;

        }

        try {

            const channel = await client.channels.fetch(
                configuration.verify_channel_id
            );

            if (!channel || !configuration.verify_message_id) {

                return;

            }

            const message =
                await channel.messages.fetch(
                    configuration.verify_message_id
                );

            if (message) {

                await message.delete();

            }

        }

        catch {

            /**
             * Ignore missing channels/messages.
             *
             * A fresh verification message will be created.
             */

        }

    }

    /**
     * ========================================================
     * Create Verification Message
     * ========================================================
     */

    static async createVerificationMessage(
        channel,
        settings = {}
    ) {

        return channel.send(

            VerificationMessage.create(settings)

        );

    }

    /**
     * ========================================================
     * Pin Verification Message
     * ========================================================
     */

    static async pinVerificationMessage(
        message
    ) {

        try {

            await message.pin();

        }

        catch {

            /**
             * Non-fatal.
             *
             * Missing Manage Messages permission
             * will already have been validated.
             */

        }

    }

    /**
     * ========================================================
     * Save Configuration
     * ========================================================
     */

    static async saveConfiguration(options) {

        const {

            client,

            guildId,

            verifyChannelId,

            verifyMessageId,

            verifiedRoleId,

            logChannelId

        } = options;

        return client.database.guilds.saveSettings({

            guildId,

            verifyChannelId,

            verifyMessageId,

            verifiedRoleId,

            logChannelId

        });

    }

        /**
 * ========================================================
 * Create Verification Session
 * ========================================================
 *
 * Creates a new CAPTCHA verification session.
 */

    static async createSession(options = {}) {

        const {

            client,
            guild,
            member,
            captchaService

            ,captchaOptions

        } = options;


        const service =

            captchaService ||

            new CaptchaService();


        const captcha =

            await service.generate(captchaOptions);


        const session = {

            guildId: guild.id,
            userId: member.id,

            captchaId: captcha.id,

            hash: captcha.hash,
            salt: captcha.salt,

            attempts: 0,
            maxAttempts: captcha.maxAttempts,

            createdAt: captcha.createdAt.getTime(),
            expiresAt: captcha.expiresAt.getTime()

        };

        // Save to database
        await client.database.captchas.create(session);


        return {

            session,

            captcha

        };
        
    }

    /**
     * ========================================================
     * Get Verification Session
     * ========================================================
     */

    static async getSession(client, guildId, userId) {

        return client.database.captchas.findActive(

            guildId,

            userId

        );

    }

    /**
     * ========================================================
     * Delete Verification Session
     * ========================================================
     */

    static async deleteSession(client, guildId, userId) {

        return client.database.captchas.delete(

            guildId,
            userId

        );

    }

    /**
     * ========================================================
     * Session Expired
     * ========================================================
     */

    static isSessionExpired(session) {

        if (!session) {

            return true;

        }

        return Date.now() >= session.expires_at;

    }

    /**
     * ========================================================
     * Increment Attempts
     * ========================================================
     */

    static async incrementAttempts(
        client,
        session
    ) {

        return client.database.captchas.incrementAttempts(

            session.guild_id ?? session.guildId,
            session.user_id ?? session.userId

        );

    }

    /**
     * ========================================================
     * Constructor
     * ========================================================
     */

    constructor(options = {}) {

        if (!options.client) {

            throw new Error(
                "VerificationManager requires a Discord client."
            );

        }

        this.client =
            options.client;


        this.logger =
            options.logger;


        this.captchaService =
            options.captchaService ??
            new CaptchaService();

        this.sessions = new Map();

        this.lockouts = new Map();

        this.answerCooldowns = new Map();

        /**
         * Configuration
         */

        this.config = {

            timeout:

                options.timeout ??

                5 * 60 * 1000

        };

    }



    /**
     * ========================================================
     * Update Configuration
     * ========================================================
     */


    configure(config = {}) {


        this.config = {


            ...this.config,


            ...config


        };


        return this;


    }



    /**
     * ========================================================
     * Get Session
     * ========================================================
     */


    getSession(userId) {


        return (

            this.sessions.get(userId)

            ||

            null

        );


    }



    /**
     * ========================================================
     * Remove Session
     * ========================================================
     */


    removeSession(userId) {


        return (

            this.sessions.delete(userId)

        );


    }

    /**
         * ========================================================
         * Start Verification
         * ========================================================
         *
         * Begins a verification attempt for a member.
         *
         * Flow:
         *
         * Button Click
         *      |
         * Generate CAPTCHA
         *      |
         * Store Session
         *      |
         * Return Challenge
         *
         * ========================================================
    */

    async startVerification(options = {}) {

            const {

                guild,

                member

            } = options;

            if (!guild) {

                throw new Error(
                    "Guild is required."
                );

            }

            const guildId = guild.id;


            if (!member) {

                throw new Error(
                    "Member is required."
                );

            }

            const storedSettings = await VerificationManager.loadExistingConfiguration(
                this.client,
                guildId
            );

            if (!storedSettings || storedSettings.verification_enabled === 0) {
                return { success: false, reason: "DISABLED" };
            }
            const settings = VerificationPresetService.resolve(storedSettings);
            const verificationRecord = await this.client.database.verificationRecords.find(guildId, member.id);
            if (member.roles.cache.has(settings.verified_role_id) && !VerificationPresetService.needsReverification(verificationRecord, settings)) {
                return { success: false, reason: "ALREADY_VERIFIED" };
            }

            const policies = await this.client.database.trustPolicies.listForGuild(guildId);
            const trustDecision = TrustPolicyService.evaluate(member, settings, policies);
            if (trustDecision.action === "DENY") {
                const reason = trustDecision.policy.reason || "Denied by a server trust policy.";
                await this.client.database.securityEvents.record({ guildId, type: "TRUST_POLICY_DENY", details: `${member.id}: ${reason}` });
                try { await this.logVerification({ member, success: false, reason }); } catch (error) { console.error("Unable to log policy denial", error); }
                return { success: false, reason: "POLICY_DENIED" };
            }
            if (trustDecision.action === "BYPASS") {
                await this.assignVerifiedRole(member);
                await this.client.database.securityEvents.record({ guildId, type: "TRUST_POLICY_BYPASS",
                    details: `${member.id}: ${trustDecision.source}` });
                await this.client.database.verificationRecords.upsert({ guildId, userId: member.id,
                    policyVersion: settings.policy_version, method: `TRUST_${trustDecision.source}` });
                await this.client.database.reverifications.remove(guildId, member.id);
                try { await this.logVerification({ member, success: true }); } catch (error) { console.error("Unable to log trusted bypass", error); }
                return { success: true, bypass: true, source: trustDecision.source };
            }

            const accountRisk = AccountRiskService.evaluate(member.user, settings);
            if (accountRisk.suspicious) {
                const policy = accountRisk.highAlertActive ? "high-alert minimum" : "server minimum";
                const reason = `Discord account is ${accountRisk.ageDays} day(s) old; ${policy} is ${accountRisk.minimumDays} day(s).`;
                if (accountRisk.highAlertActive) {
                    try {
                        await this.client.database.securityEvents.record({ guildId, type: accountRisk.action === "BLOCK" ? "HIGH_ALERT_BLOCK" : "HIGH_ALERT_MONITOR",
                            details: `${member.id}: ${reason}` });
                    } catch (error) { console.error("Unable to record high-alert decision", error); }
                }
                if (accountRisk.action === "BLOCK") {
                    try {
                        await this.logVerification({ member, success: false, reason });
                    } catch (error) {
                        console.error("Unable to log blocked new account", error);
                    }
                    return { success: false, reason: "ACCOUNT_TOO_NEW", minimumDays: accountRisk.minimumDays };
                }
                await this.logSuspiciousAccount({ member, settings, reason });
            }

            const lockoutKey = this.sessionKey(guildId, member.id);
            const lockedUntil = this.lockouts.get(lockoutKey);
            if (lockedUntil && lockedUntil > Date.now()) {
                return { success: false, reason: "LOCKED", retryAt: lockedUntil };
            }
            this.lockouts.delete(lockoutKey);



            /**
             * Check for existing session
             */

            const existingSession =

                await VerificationManager.getSession(

                    this.client,

                    guildId,

                    member.id

                );



            if (existingSession) {


                if (

                    !VerificationManager.isSessionExpired(
                        existingSession
                    )

                ) {

                    return {

                        success: false,

                        reason:
                            "ACTIVE_SESSION"

                    };

                }



                await VerificationManager.deleteSession(

                    this.client,

                    guildId,
                    member.id

                );

            }




            /**
             * Generate CAPTCHA
             */

            const result =

                await VerificationManager.createSession({

                    client:

                        this.client,

                    guild,

                    member,

                    captchaService:
                        this.captchaService,

                    captchaOptions: {
                        length: settings.captcha_length,
                        expiration: settings.captcha_expiration_minutes * 60 * 1000,
                        maxAttempts: settings.max_attempts,
                        difficulty: settings.captcha_difficulty
                    }

                });
                



            /**
             * Store runtime session
             */

            this.sessions.set(
                this.sessionKey(guildId, member.id),

                {

                    session:

                        result.session,

                    captcha:

                        result.captcha,

                    createdAt:

                        Date.now()

                }

            );



            return {

                success: true,


                captcha:

                    result.captcha,


                session:

                    result.session

            };

        }

        /**
         * ========================================================
         * Get Runtime Session
         * ========================================================
         */

        sessionKey(guildId, userId) {

            return `${guildId}:${userId}`;

        }

        getRuntimeSession(guildId, userId) {

            return (

                this.sessions.get(this.sessionKey(guildId, userId))

                ||

                null

            );

        }

        /**
         * ========================================================
         * Clear Runtime Session
         * ========================================================
         */

        clearRuntimeSession(guildId, userId) {

            return this.sessions.delete(

                this.sessionKey(guildId, userId)

            );

        }

        /**
         * ========================================================
         * Send CAPTCHA Challenge
         * ========================================================
         *
         * Sends the CAPTCHA privately to the user.
         *
         * ========================================================
         */

        async sendCaptchaChallenge(options = {}) {

            const { interaction, captcha } = options;


            const button = this.createCaptchaButton();

            const row = new ActionRowBuilder()
                .addComponents(button);


            await interaction.reply({

                content:

                    "🔐 **Verification Required**\n\n" +
                
                    "Please solve the CAPTCHA below and click **Enter CAPTCHA**.",
                
                    files: [captcha.attachment],
                
                    components: [row],
                
                    ephemeral: true
            });
        }

        /**
         * ========================================================
         * Create CAPTCHA Button
         * ========================================================
         */

        createCaptchaButton() {


            return new ButtonBuilder()

                .setCustomId(

                    "verify_captcha_enter"

                )

                .setLabel(

                    "Enter CAPTCHA"

                )

                .setStyle(

                    ButtonStyle.Primary

                );

        }

        /**
         * ========================================================
         * Begin User Verification
         * ========================================================
         */

        async beginVerification(options = {}) {


            const result =

                await this.startVerification(

                    options

                );



            if (!result.success) {

                if (result.reason === "ACTIVE_SESSION") {
                    await options.interaction.reply({
                        content: "You already have an active verification challenge.",
                        ephemeral: true
                    });
                }

                if (result.reason === "DISABLED") {
                    await options.interaction.reply({
                        content: "Verification is currently disabled for this server.",
                        ephemeral: true
                    });
                }

                if (result.reason === "LOCKED") {
                    const seconds = Math.max(1, Math.ceil((result.retryAt - Date.now()) / 1000));
                    await options.interaction.reply({
                        content: `Too many failed attempts. Try again in ${seconds} seconds.`,
                        ephemeral: true
                    });
                }

                if (result.reason === "ACCOUNT_TOO_NEW") {
                    await options.interaction.reply({
                        content: `Your Discord account must be at least ${result.minimumDays} day(s) old to verify in this server.`,
                        ephemeral: true
                    });
                }

                if (result.reason === "POLICY_DENIED") {
                    await options.interaction.reply({ content: "Verification is unavailable for this account. Contact a server administrator if you believe this is an error.", ephemeral: true });
                }

                if (result.reason === "ALREADY_VERIFIED") {
                    await options.interaction.reply({ content: "You are already verified and your verification is current.", ephemeral: true });
                }

                return result;


            }


            if (result.bypass) {
                await options.interaction.reply({ embeds: [EmbedFactory.success("Verification Complete",
                    "You matched a trusted server policy and were verified automatically.")], ephemeral: true });
                await this.client.onboardingService?.deliver(options.member, `TRUST_${result.source}`)
                    .catch(error => console.error("Trusted onboarding failed", error));
                return result;
            }



            await this.sendCaptchaChallenge({

                interaction:

                    options.interaction,


                captcha:

                    result.captcha

            });



            return result;


        }

        /**
         * ========================================================
         * Create CAPTCHA Modal
         * ========================================================
         */

        createCaptchaModal() {


            const modal =

                new ModalBuilder()

                    .setCustomId(

                        "verify_captcha_modal"

                    )

                    .setTitle(

                        "CAPTCHA Verification"

                    );



            const input =

                new TextInputBuilder()

                    .setCustomId(

                        "captcha_answer"

                    )

                    .setLabel(

                        "Enter the CAPTCHA code"

                    )

                    .setPlaceholder(

                        "Example: A7KD9M"

                    )

                    .setStyle(

                        TextInputStyle.Short

                    )

                    .setRequired(

                        true

                    )

                    .setMinLength(

                        1

                    )

                    .setMaxLength(

                        10

                    );



            const row =

                new ActionRowBuilder()

                    .addComponents(

                        input

                    );



            modal.addComponents(

                row

            );


            return modal;

        }

        /**
         * ========================================================
         * Open CAPTCHA Modal
         * ========================================================
         */

        async openCaptchaModal(interaction) {


            const modal =

                this.createCaptchaModal();



            await interaction.showModal(

                modal

            );


        }

        /**
         * ========================================================
         * Handle CAPTCHA Submission
         * ========================================================
         */

        async handleCaptchaSubmission(interaction) {


            const userId =

                interaction.user.id;



            const runtime =

                this.getRuntimeSession(
                    interaction.guild.id,
                    userId

                );



            if (!runtime) {


                return interaction.reply({

                    content:

                        "❌ Your verification session has expired.",


                    ephemeral:

                        true

                });


            }

            const sessionKey = this.sessionKey(interaction.guild.id, userId);
            const settings = await VerificationManager.loadExistingConfiguration(
                this.client,
                interaction.guild.id
            );
            const cooldownUntil = this.answerCooldowns.get(sessionKey);
            if (cooldownUntil && cooldownUntil > Date.now()) {
                const seconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
                return interaction.reply({
                    content: `Please wait ${seconds} seconds before submitting another answer.`,
                    ephemeral: true
                });
            }
            this.answerCooldowns.delete(sessionKey);



            const answer =

                interaction.fields.getTextInputValue(

                    "captcha_answer"

                )

                .trim()

                .toUpperCase();




            const result =

                this.captchaService.verify(

                    runtime.captcha.id,

                    answer

                );




            if (!result.success) {


                await VerificationManager.incrementAttempts(

                    this.client,

                    runtime.session

                );

                runtime.session.attempts = (runtime.session.attempts ?? 0) + 1;

                if (runtime.session.attempts >= runtime.session.maxAttempts) {
                    const lockoutMinutes = settings?.lockout_minutes ?? 10;
                    this.lockouts.set(
                        this.sessionKey(interaction.guild.id, userId),
                        Date.now() + (lockoutMinutes * 60 * 1000)
                    );
                    this.clearRuntimeSession(interaction.guild.id, userId);
                    await VerificationManager.deleteSession(this.client, interaction.guild.id, userId);
                    await this.logVerification({ member: interaction.member, success: false, reason: "MAX_ATTEMPTS" });
                    return interaction.reply({
                        content: `Too many incorrect attempts. Verification is locked for ${lockoutMinutes} minutes.`,
                        ephemeral: true
                    });
                }

                const cooldownSeconds = settings?.cooldown_seconds ?? 30;
                if (cooldownSeconds > 0) {
                    this.answerCooldowns.set(sessionKey, Date.now() + (cooldownSeconds * 1000));
                }



                return interaction.reply({

                    content:

                        "❌ Incorrect CAPTCHA. Please try again.",


                    ephemeral:

                        true

                });


            }



            this.clearRuntimeSession(
                interaction.guild.id,
                userId

            );



            await VerificationManager.deleteSession(

                this.client,

                    runtime.session.guildId,
                    runtime.session.userId

            );



            return {

                success: true,

                session:

                    runtime.session,

                captcha:

                    runtime.captcha

            };

        }

        /**
         * ========================================================
         * Handle Interaction
         * ========================================================
         */

        async handleInteraction(interaction) {


            if (

                interaction.isButton()

                &&

                interaction.customId ===

                "verify_captcha_enter"

            ) {


                return this.openCaptchaModal(

                    interaction

                );


            }



            if (

                interaction.isModalSubmit()

                &&

                interaction.customId ===

                "verify_captcha_modal"

            ) {


                return this.handleCaptchaSubmission(

                    interaction

                );


            }

        }

        /**
         * ========================================================
         * Assign Verified Role
         * ========================================================
         */
        
        async assignVerifiedRole(member) {

            const config =
                await VerificationManager.loadExistingConfiguration(
                    this.client,
                    member.guild.id
                );

            if (!config) {

                throw new Error(
                    "Verification has not been configured."
                );

            }

            const roleId = config.verified_role_id;

            if (!roleId) {

                throw new Error(
                    "Verified role has not been configured."
                );

            }

            const role =
                await member.guild.roles.fetch(roleId);


            if (!role) {

                throw new Error(
                    "Verified role was not found."
                );

            }

            if (member.roles.cache.has(role.id)) {

                return false;

            }

            await member.roles.add(role);

            return true;
        }
        

        /**
         * ========================================================
         * Complete Verification
         * ========================================================
         */

        async completeVerification(options = {}) {


            const {

                interaction,

                member,

                session

            } = options;


            await this.assignVerifiedRole(member);


            // await this.assignVerifiedRole(

            //     member

            // );



            /**
             * Update database
             */

            await this.client.database.captchas.complete(

                member.id,
                member.guild.id

            );



            /**
             * Remove runtime data
             */

            this.clearRuntimeSession(
                member.guild.id,
                member.id

            );



            await this.logVerification({

                member,

                success:

                    true,

                session

            });

            const settings = await VerificationManager.loadExistingConfiguration(this.client, member.guild.id);
            await this.client.database.verificationRecords.upsert({ guildId: member.guild.id, userId: member.id,
                policyVersion: settings?.policy_version || 1, method: "CAPTCHA" });
            await this.client.database.reverifications.remove(member.guild.id, member.id);

            /**
             * Send response
             */

            await interaction.reply({
                embeds:
                    [
                        EmbedFactory.success(
                            "Verification Complete",
                            (await VerificationManager.loadExistingConfiguration(
                                this.client,
                                member.guild.id
                            ))?.success_message || "You have been verified successfully."
                        )
                    ],
                ephemeral: true
            });

            await this.client.onboardingService?.deliver(member, "CAPTCHA")
                .catch(error => console.error("Onboarding delivery failed", error));

            return {

                success:

                    true

            };


        }

        /**
         * ========================================================
         * Failed Verification
         * ========================================================
         */

        async failVerification(options = {}) {


            const {

                interaction,

                member,

                reason

            } = options;



            await this.logVerification({

                member,

                success:

                    false,

                reason

            });



            return interaction.reply({

                embeds:

                    [

                        EmbedFactory.error(

                            "Verification Failed",

                            reason ||

                            "Incorrect CAPTCHA."

                        )

                    ],


                ephemeral:

                    true

            });
        }

        /**
         * ========================================================
         * Verification Logging
         * ========================================================
         */

        async logVerification(options = {}) {


            const {

                member,

                success,

                reason,

                session

            } = options;



            await this.client.database.logs.record({
                guildId: member.guild.id,
                userId: member.id,
                success,
                failureReason: reason ?? null,
                attempts: session?.attempts ?? null,
                verificationDuration: session?.createdAt ? Math.max(0, Math.round((Date.now() - Number(session.createdAt)) / 1000)) : null
            });

            const settings = await VerificationManager.loadExistingConfiguration(
                this.client,
                member.guild.id
            );

            this.answerCooldowns.delete(this.sessionKey(member.guild.id, member.id));

            const channelId = settings?.log_channel_id;



            if (!channelId) {

                return;

            }



            const channel =

                await member.guild.channels.fetch(

                    channelId

                );



            if (!channel) {

                return;

            }



            await channel.send({

                embeds:

                    [

                        success

                            ?

                        EmbedFactory.success(

                            "Member Verified",

                            `${member} has completed verification.`

                        )
                            :

                        EmbedFactory.error(

                            "Verification Failed",

                            `${member} failed verification.\n${reason || ""}`

                        )

                    ]

            });


        }

        resetMemberState(guildId, userId) {
            const key = this.sessionKey(guildId, userId);
            this.clearRuntimeSession(guildId, userId);
            this.lockouts.delete(key);
            this.answerCooldowns.delete(key);
        }

        async logSuspiciousAccount({ member, settings, reason }) {
            if (!settings?.log_channel_id) return;
            try {
                const channel = await member.guild.channels.fetch(settings.log_channel_id);
                if (!channel) return;
                await channel.send({
                    embeds: [EmbedFactory.error("New Account Detected", `${member} was allowed to continue verification.\n${reason}`)]
                });
            } catch (error) {
                console.error("Unable to send new-account alert", error);
            }
        }

        /**
         * ========================================================
         * Cleanup Sessions
         * ========================================================
         */

        async cleanupSessions() {


            for (

                const [

                    userId,

                    runtime

                ] of this.sessions

            ) {


                if (

                    Date.now() -

                    runtime.createdAt >

                    this.config.timeout

                ) {


                    this.sessions.delete(

                        userId

                    );


                }


            }


        }

        /**
         * ========================================================
         * Shutdown
         * ========================================================
         */

        shutdown() {


            this.sessions.clear();

            this.lockouts.clear();

            this.answerCooldowns.clear();


        }
}

module.exports = VerificationManager;
