const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const VerificationManager = require("../managers/VerificationManager");
const SQLiteSessionStore = require("./SQLiteSessionStore");
const ModerationService = require("../services/ModerationService");
const ConfigurationHealthService = require("../services/ConfigurationHealthService");

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
    })[character]);
}

function layout(title, user, content) {
    const account = user
        ? `<div class="account"><span>${escapeHtml(user.username)}</span><a href="/logout">Sign out</a></div>`
        : "";
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Gatekeeper</title><link rel="icon" type="image/png" href="/securebootlabs-logo.png"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/navigation.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/raid.css"></head><body><header><a class="brand" href="/"><img class="brand-logo" src="/securebootlabs-logo.png" alt="SecureBootLabs"><span>Gatekeeper</span></a><nav class="header-nav" aria-label="Primary navigation"><a class="store-link" href="https://securebootlabs.com" target="_blank" rel="noopener noreferrer">SecureBootLabs Store <span aria-hidden="true">↗</span></a>${account}</nav></header><main>${content}</main></body></html>`;
}

class DashboardServer {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.app = express();
        this.server = null;
        this.configure();
    }

    configure() {
        if (this.config.baseUrl.startsWith("https://")) {
            this.app.set("trust proxy", 1);
        }
        this.app.use(helmet({ contentSecurityPolicy: { directives: { "img-src": ["'self'", "https://cdn.discordapp.com", "data:"] } } }));
        const dashboardUrl = new URL(this.config.baseUrl);
        this.app.use((request, response, next) => {
            const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
            const requestHost = request.hostname;
            if (localHosts.has(requestHost) && request.headers.host !== dashboardUrl.host) {
                return response.redirect(307, `${this.config.baseUrl}${request.originalUrl}`);
            }
            next();
        });
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, "public")));
        this.app.use(session({
            name: "sentinel.sid",
            store: new SQLiteSessionStore(this.client.database),
            secret: this.config.sessionSecret || crypto.randomBytes(32).toString("hex"),
            resave: false,
            saveUninitialized: false,
            cookie: { httpOnly: true, sameSite: "lax", secure: this.config.baseUrl.startsWith("https://"), maxAge: 86400000 }
        }));
        this.routes();
    }

    routes() {
        this.app.get("/health", async (request, response) => {
            const database = await this.client.database.health();
            const healthy = this.client.isReady() && database.connected;
            response.status(healthy ? 200 : 503).json({
                status: healthy ? "ok" : "degraded",
                bot: this.client.isReady(),
                database,
                uptimeSeconds: Math.floor(process.uptime()),
                timestamp: new Date().toISOString()
            });
        });
        this.app.get("/login", (request, response) => {
            if (!this.config.clientSecret) return response.status(503).send(layout("Setup required", null, this.setupRequired()));
            request.session.regenerate(error => {
                if (error) return response.status(500).send("Unable to begin a login session.");
                request.session.oauthState = crypto.randomBytes(24).toString("hex");
                const parameters = new URLSearchParams({ client_id: this.client.user.id, redirect_uri: `${this.config.baseUrl}/callback`, response_type: "code", scope: "identify guilds", state: request.session.oauthState, prompt: "none" });
                request.session.save(saveError => {
                    if (saveError) return response.status(500).send("Unable to save the login session.");
                    response.redirect(`https://discord.com/oauth2/authorize?${parameters}`);
                });
            });
        });
        this.app.get("/callback", async (request, response, next) => {
            try {
                if (!request.query.code || request.query.state !== request.session.oauthState) {
                    return response.status(400).send(layout("Sign-in expired", null, '<section class="hero"><p class="eyebrow">Discord sign-in</p><h1>Your login session expired</h1><p>Return to the dashboard and begin a fresh sign-in.</p><a class="button" href="/login">Try again</a></section>'));
                }
                const token = await this.discordToken(request.query.code);
                const headers = { Authorization: `Bearer ${token.access_token}` };
                const [userResponse, guildResponse] = await Promise.all([fetch("https://discord.com/api/users/@me", { headers }), fetch("https://discord.com/api/users/@me/guilds", { headers })]);
                if (!userResponse.ok || !guildResponse.ok) throw new Error("Discord profile request failed.");
                request.session.user = await userResponse.json();
                request.session.guilds = (await guildResponse.json()).filter(guild => this.canManage(guild.permissions));
                request.session.csrf = crypto.randomBytes(24).toString("hex");
                delete request.session.oauthState;
                response.redirect("/");
            } catch (error) { next(error); }
        });
        this.app.get("/logout", (request, response) => request.session.destroy(() => response.redirect("/")));
        this.app.get("/", this.requireAuth.bind(this), (request, response) => response.send(layout("Servers", request.session.user, this.serverList(request))));
        this.app.get("/guild/:guildId", this.requireGuild.bind(this), async (request, response) => response.send(layout("Overview", request.session.user, await this.guildPageV2(request))));
        this.app.get("/guild/:guildId/setup", this.requireGuild.bind(this), async (request, response) => {
            response.send(layout("Setup wizard", request.session.user, await this.setupWizard(request)));
        });
        this.app.post("/guild/:guildId/setup", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const guild = request.dashboardGuild;
                const previous = await this.client.database.guilds.getSettings(guild.id) || {};
                const settings = this.wizardSettings(request.body, previous, request.session.user.id);
                const verifyChannel = await guild.channels.fetch(settings.verifyChannelId);
                const verifiedRole = await guild.roles.fetch(settings.verifiedRoleId);
                const logChannel = settings.logChannelId ? await guild.channels.fetch(settings.logChannelId) : null;
                if (!verifyChannel?.isTextBased() || verifiedRole?.managed) throw new Error("Select a valid text channel and server role.");
                await VerificationManager.setup({ client: this.client, guild, verifyChannel, verifiedRole, logChannel,
                    requestedBy: request.session.user, messageSettings: { enabled: true, title: settings.messageTitle,
                        description: settings.messageDescription, color: settings.messageColor, buttonLabel: settings.buttonLabel } });
                await this.client.database.guilds.updateDashboardSettings(guild.id, settings);
                await this.client.database.guilds.markSetupComplete(guild.id, request.session.user.id);
                const healthService = this.client.configurationHealthService || new ConfigurationHealthService(this.client);
                await healthService.inspectGuild(guild, await this.client.database.guilds.getSettings(guild.id));
                await this.client.database.securityEvents.record({ guildId: guild.id, type: "SETUP_WIZARD_COMPLETED",
                    details: `${settings.verificationPreset} preset by ${request.session.user.id}` });
                response.redirect(`/guild/${guild.id}?setupComplete=1#overview`);
            } catch (error) { next(error); }
        });
        this.app.post("/guild/:guildId/health-test", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const settings = await this.client.database.guilds.getSettings(request.dashboardGuild.id) || {};
                const healthService = this.client.configurationHealthService || new ConfigurationHealthService(this.client);
                const result = await healthService.test(request.dashboardGuild, settings);
                await this.client.database.guilds.updateHealth(request.dashboardGuild.id, result.health.score);
                await this.client.database.securityEvents.record({ guildId: request.dashboardGuild.id, type: "CONFIGURATION_TEST_RUN",
                    details: `${result.passed ? "Passed" : "Failed"}; score ${result.health.score}; by ${request.session.user.id}` });
                response.redirect(`/guild/${request.dashboardGuild.id}?test=${result.passed ? "passed" : "failed"}&issues=${result.health.issues.length}#overview`);
            } catch (error) { next(error); }
        });
        this.app.post("/guild/:guildId/settings", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const guild = request.dashboardGuild;
                const dashboardSettings = this.parseSettings(request.body, request.session.user.id);
                const previousSettings = await this.client.database.guilds.getSettings(guild.id);
                const verifyChannel = await guild.channels.fetch(request.body.verifyChannelId);
                const verifiedRole = await guild.roles.fetch(request.body.verifiedRoleId);
                const logChannel = request.body.logChannelId ? await guild.channels.fetch(request.body.logChannelId) : null;
                await VerificationManager.setup({
                    client: this.client,
                    guild,
                    verifyChannel,
                    verifiedRole,
                    logChannel,
                    requestedBy: request.session.user,
                    messageSettings: {
                        enabled: dashboardSettings.verificationEnabled,
                        title: dashboardSettings.messageTitle,
                        description: dashboardSettings.messageDescription,
                        color: dashboardSettings.messageColor,
                        buttonLabel: dashboardSettings.buttonLabel
                    }
                });
                await this.client.database.guilds.updateDashboardSettings(guild.id, dashboardSettings);
                if (this.policyChanged(previousSettings, dashboardSettings)) {
                    await this.client.database.guilds.incrementPolicyVersion(guild.id);
                    await this.client.database.securityEvents.record({ guildId: guild.id, type: "VERIFICATION_POLICY_UPDATED",
                        details: `${dashboardSettings.verificationPreset} preset by ${request.session.user.id}` });
                }
                if (["enable", "disable"].includes(request.body.manualHighAlert)) {
                    const enabledUntil = request.body.manualHighAlert === "enable"
                        ? Date.now() + dashboardSettings.highAlertMinutes * 60000
                        : 0;
                    await this.client.database.guilds.setHighAlertUntil(guild.id, enabledUntil);
                    if (request.body.manualHighAlert === "disable") this.client.joinVelocityService?.resetGuild(guild.id);
                    await this.client.database.securityEvents.record({
                        guildId: guild.id,
                        type: request.body.manualHighAlert === "enable" ? "MANUAL_HIGH_ALERT_ENABLED" : "MANUAL_HIGH_ALERT_DISABLED",
                        details: `Dashboard action by ${request.session.user.username}`
                    });
                }
                response.redirect(`/guild/${guild.id}?saved=1`);
            } catch (error) { next(error); }
        });
        this.app.post("/guild/:guildId/policies", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const guildId = request.dashboardGuild.id;
                if (request.body.policyAction === "remove") {
                    const subjectType = request.body.subjectType === "ROLE" ? "ROLE" : "USER";
                    const subjectId = String(request.body.subjectId || "").replace(/[^0-9]/g, "").slice(0, 20);
                    if (!subjectId) throw new Error("A valid policy subject is required.");
                    await this.client.database.trustPolicies.remove(guildId, subjectType, subjectId);
                    await this.client.database.securityEvents.record({ guildId, type: "TRUST_POLICY_REMOVED",
                        details: `${subjectType} ${subjectId} by ${request.session.user.id}` });
                } else {
                    const rolePolicy = request.body.policyAction === "TRUST_ROLE";
                    const subjectType = rolePolicy ? "ROLE" : "USER";
                    const subjectId = String(rolePolicy ? request.body.roleId : request.body.userId || "").replace(/[^0-9]/g, "").slice(0, 20);
                    if (!subjectId) throw new Error("Enter a valid Discord user ID or select a role.");
                    const durationDays = Math.min(Math.max(Number.parseInt(request.body.durationDays, 10) || 0, 0), 3650);
                    const policy = request.body.policyAction === "DENY_USER" ? "DENY" : "TRUST";
                    await this.client.database.trustPolicies.upsert({ guildId, subjectType, subjectId, policy,
                        reason: String(request.body.policyReason || "").trim().slice(0, 250) || null,
                        expiresAt: durationDays ? Date.now() + durationDays * 86400000 : 0, createdBy: request.session.user.id });
                    if (policy === "DENY") await ModerationService.revokeIfDenied(this.client, request.dashboardGuild, subjectId, request.session.user.id, request.body.policyReason);
                    await this.client.database.securityEvents.record({ guildId, type: `TRUST_POLICY_${policy}`,
                        details: `${subjectType} ${subjectId} by ${request.session.user.id}` });
                }
                response.redirect(`/guild/${guildId}?policySaved=1#policies`);
            } catch (error) { next(error); }
        });
        this.app.post("/guild/:guildId/moderation", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const userId = String(request.body.userId || "").replace(/[^0-9]/g, "").slice(0, 20);
                if (!userId) throw new Error("Enter a valid Discord user ID.");
                const action = request.body.moderationAction;
                if (!["verify", "unverify", "reset", "reverify"].includes(action)) throw new Error("Invalid moderation action.");
                if (["unverify", "reset", "reverify"].includes(action) && request.body.confirmation !== "on") throw new Error("Confirm this action before continuing.");
                const member = await request.dashboardGuild.members.fetch(userId);
                const note = String(request.body.moderatorNote || "").trim().slice(0, 250);
                if (action === "verify") await ModerationService.verify(this.client, member, request.session.user.id, note);
                if (action === "unverify") await ModerationService.unverify(this.client, member, request.session.user.id, note);
                if (action === "reset") await ModerationService.reset(this.client, member, request.session.user.id, note);
                if (action === "reverify") await ModerationService.requireReverification(this.client, member, request.session.user.id, note);
                response.redirect(`/guild/${request.dashboardGuild.id}?memberId=${userId}&moderated=1#moderation`);
            } catch (error) { next(error); }
        });
        this.app.post("/guild/:guildId/reverification", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const guild = request.dashboardGuild;
                const action = String(request.body.reverificationAction || "");
                if (action === "scan") await this.client.reverificationService?.discoverGuild(guild, await this.client.database.guilds.getSettings(guild.id));
                else if (["pause", "resume"].includes(action)) await this.client.database.guilds.setReverificationPaused(guild.id, action === "pause");
                else if (action === "cancel") {
                    const userId = String(request.body.userId || "").replace(/[^0-9]/g, "").slice(0, 20);
                    if (!userId) throw new Error("A valid member is required.");
                    await this.client.database.reverifications.markCancelled(guild.id, userId);
                } else throw new Error("Invalid reverification action.");
                await this.client.database.securityEvents.record({ guildId: guild.id, type: `REVERIFICATION_${action.toUpperCase()}`,
                    details: `Dashboard action by ${request.session.user.id}` });
                response.redirect(`/guild/${guild.id}?reverificationUpdated=1#reverification`);
            } catch (error) { next(error); }
        });
        this.app.get("/api/guild/:guildId/overview", this.requireGuild.bind(this), async (request, response) => response.json(await this.overview(request.params.guildId)));
        this.app.use((error, request, response, next) => { console.error("Dashboard error", error); response.status(500).send(layout("Error", request.session?.user, `<section class="panel"><h1>Something went wrong</h1><p>${escapeHtml(error.message)}</p><a class="button" href="/">Return to dashboard</a></section>`)); });
    }

    async discordToken(code) {
        const body = new URLSearchParams({ client_id: this.client.user.id, client_secret: this.config.clientSecret, grant_type: "authorization_code", code, redirect_uri: `${this.config.baseUrl}/callback` });
        const response = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!response.ok) throw new Error("Discord sign-in failed.");
        return response.json();
    }

    canManage(permissions) { const value = BigInt(permissions); return Boolean(value & MANAGE_GUILD || value & ADMINISTRATOR); }
    requireAuth(request, response, next) { if (!request.session.user) return response.redirect("/login"); next(); }
    requireCsrf(request, response, next) { if (!request.session.csrf || request.body.csrf !== request.session.csrf) return response.status(403).send("Invalid request token."); next(); }
    requireGuild(request, response, next) {
        if (!request.session.user) return response.redirect("/login");
        const allowed = request.session.guilds?.some(guild => guild.id === request.params.guildId);
        const guild = this.client.guilds.cache.get(request.params.guildId);
        if (!allowed || !guild) return response.status(403).send(layout("Unavailable", request.session.user, "<section class=\"panel\"><h1>Server unavailable</h1><p>You cannot manage this server, or the bot is not installed there.</p></section>"));
        request.dashboardGuild = guild;
        next();
    }

    parseSettings(body, userId) {
        const integer = (value, minimum, maximum, fallback) => {
            const parsed = Number.parseInt(value, 10);
            return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
        };
        const text = (value, maximum, fallback) => String(value || fallback).trim().slice(0, maximum);
        const color = /^#[0-9A-F]{6}$/i.test(body.messageColor || "") ? body.messageColor.toUpperCase() : "#5865F2";
        const difficulty = ["EASY", "MEDIUM", "HARD"].includes(body.captchaDifficulty) ? body.captchaDifficulty : "MEDIUM";
        const suspiciousAction = ["BLOCK", "LOG_ONLY"].includes(body.suspiciousAccountAction) ? body.suspiciousAccountAction : "BLOCK";
        const highAlertAction = ["MONITOR", "BLOCK"].includes(body.highAlertAction) ? body.highAlertAction : "MONITOR";
        return {
            verificationEnabled: body.verificationEnabled === "on",
            messageTitle: text(body.messageTitle, 256, "Server Verification"),
            messageDescription: text(body.messageDescription, 4000, "Complete the CAPTCHA below to gain access to the server."),
            messageColor: color,
            buttonLabel: text(body.buttonLabel, 80, "Verify"),
            successMessage: text(body.successMessage, 1000, "You have been verified successfully."),
            captchaLength: integer(body.captchaLength, 4, 10, 6),
            captchaExpirationMinutes: integer(body.captchaExpirationMinutes, 1, 30, 5),
            maxAttempts: integer(body.maxAttempts, 1, 10, 5),
            cooldownSeconds: integer(body.cooldownSeconds, 0, 300, 30),
            lockoutMinutes: integer(body.lockoutMinutes, 1, 1440, 10),
            captchaDifficulty: difficulty,
            minimumAccountAgeDays: integer(body.minimumAccountAgeDays, 0, 365, 0),
            suspiciousAccountAction: suspiciousAction,
            raidProtectionEnabled: body.raidProtectionEnabled === "on",
            joinVelocityThreshold: integer(body.joinVelocityThreshold, 3, 100, 10),
            joinVelocityWindowSeconds: integer(body.joinVelocityWindowSeconds, 10, 600, 60),
            highAlertMinutes: integer(body.highAlertMinutes, 1, 120, 10),
            highAlertAction,
            highAlertMinimumAccountAgeDays: integer(body.highAlertMinimumAccountAgeDays, 0, 365, 7),
            raidAlertCooldownMinutes: integer(body.raidAlertCooldownMinutes, 1, 1440, 30),
            automaticTrustedVerification: body.automaticTrustedVerification === "on",
            trustedAccountAgeDays: integer(body.trustedAccountAgeDays, 1, 3650, 90),
            removeVerifiedRoleOnDeny: body.removeVerifiedRoleOnDeny === "on",
            scheduledReportsEnabled: body.scheduledReportsEnabled === "on",
            reportFrequency: body.reportFrequency === "DAILY" ? "DAILY" : "WEEKLY",
            reportChannelId: String(body.reportChannelId || "").replace(/[^0-9]/g, "").slice(0, 20) || null,
            reportHourUtc: integer(body.reportHourUtc, 0, 23, 12),
            reportWeekday: integer(body.reportWeekday, 0, 6, 1),
            quietHoursStartUtc: integer(body.quietHoursStartUtc, 0, 23, 0),
            quietHoursEndUtc: integer(body.quietHoursEndUtc, 0, 23, 0),
            minimumAlertSeverity: ["INFO", "WARNING", "CRITICAL"].includes(body.minimumAlertSeverity) ? body.minimumAlertSeverity : "WARNING",
            verificationPreset: ["BASIC", "STANDARD", "STRICT"].includes(body.verificationPreset) ? body.verificationPreset : "STANDARD",
            strictMinimumAccountAgeDays: integer(body.strictMinimumAccountAgeDays, 1, 365, 7),
            reverifyAfterDays: integer(body.reverifyAfterDays, 0, 3650, 0),
            reverificationEnforcementEnabled: body.reverificationEnforcementEnabled === "on",
            reverificationPaused: body.reverificationPaused === "on",
            reverificationGraceDays: integer(body.reverificationGraceDays, 1, 30, 7),
            reverificationReminderDays: integer(body.reverificationReminderDays, 1, 30, 3),
            reverificationNotifyDm: body.reverificationNotifyDm === "on",
            reverificationChannelId: String(body.reverificationChannelId || "").replace(/[^0-9]/g, "").slice(0, 20) || null,
            updatedBy: userId
        };
    }

    wizardSettings(body, previous, userId) {
        const preset = ["BASIC", "STANDARD", "STRICT"].includes(body.verificationPreset) ? body.verificationPreset : "STANDARD";
        return {
            verificationEnabled: true, messageTitle: previous.message_title || "Server Verification",
            messageDescription: previous.message_description || "Complete the CAPTCHA below to gain access to the server.",
            messageColor: previous.message_color || "#5865F2", buttonLabel: previous.button_label || "Verify",
            successMessage: previous.success_message || "You have been verified successfully.",
            captchaLength: Number(previous.captcha_length) || 6, captchaExpirationMinutes: Number(previous.captcha_expiration_minutes) || 5,
            maxAttempts: Number(previous.max_attempts) || 5, cooldownSeconds: Number(previous.cooldown_seconds) || 30,
            lockoutMinutes: Number(previous.lockout_minutes) || 10, captchaDifficulty: previous.captcha_difficulty || "MEDIUM",
            minimumAccountAgeDays: Number(previous.minimum_account_age_days) || 0, suspiciousAccountAction: previous.suspicious_account_action || "BLOCK",
            raidProtectionEnabled: Number(previous.raid_protection_enabled) === 1, joinVelocityThreshold: Number(previous.join_velocity_threshold) || 10,
            joinVelocityWindowSeconds: Number(previous.join_velocity_window_seconds) || 60, highAlertMinutes: Number(previous.high_alert_minutes) || 10,
            highAlertAction: previous.high_alert_action || "MONITOR", highAlertMinimumAccountAgeDays: Number(previous.high_alert_minimum_account_age_days) || 7,
            raidAlertCooldownMinutes: Number(previous.raid_alert_cooldown_minutes) || 30, automaticTrustedVerification: Number(previous.automatic_trusted_verification) === 1,
            trustedAccountAgeDays: Number(previous.trusted_account_age_days) || 90, removeVerifiedRoleOnDeny: Number(previous.remove_verified_role_on_deny) === 1,
            scheduledReportsEnabled: Number(previous.scheduled_reports_enabled) === 1, reportFrequency: previous.report_frequency || "WEEKLY",
            reportChannelId: previous.report_channel_id || null, reportHourUtc: Number(previous.report_hour_utc) || 12,
            reportWeekday: Number(previous.report_weekday) || 1, quietHoursStartUtc: Number(previous.quiet_hours_start_utc) || 0,
            quietHoursEndUtc: Number(previous.quiet_hours_end_utc) || 0, minimumAlertSeverity: previous.minimum_alert_severity || "WARNING",
            verificationPreset: preset, strictMinimumAccountAgeDays: Number(previous.strict_minimum_account_age_days) || 7,
            reverifyAfterDays: Number(previous.reverify_after_days) || 0, reverificationEnforcementEnabled: Number(previous.reverification_enforcement_enabled) === 1,
            reverificationPaused: Number(previous.reverification_paused) === 1, reverificationGraceDays: Number(previous.reverification_grace_days) || 7,
            reverificationReminderDays: Number(previous.reverification_reminder_days) || 3, reverificationNotifyDm: Number(previous.reverification_notify_dm) !== 0,
            reverificationChannelId: previous.reverification_channel_id || null, verifyChannelId: String(body.verifyChannelId || ""),
            verifiedRoleId: String(body.verifiedRoleId || ""), logChannelId: String(body.logChannelId || "") || null, updatedBy: userId
        };
    }

    policyChanged(previous = {}, next) {
        const comparisons = [
            [previous.verification_preset || "STANDARD", next.verificationPreset],
            [Number(previous.strict_minimum_account_age_days ?? 7), next.strictMinimumAccountAgeDays],
            [Number(previous.reverify_after_days ?? 0), next.reverifyAfterDays],
            [Number(previous.minimum_account_age_days ?? 0), next.minimumAccountAgeDays],
            [previous.suspicious_account_action || "BLOCK", next.suspiciousAccountAction],
            [previous.captcha_difficulty || "MEDIUM", next.captchaDifficulty],
            [Number(previous.captcha_length ?? 6), next.captchaLength],
            [Number(previous.max_attempts ?? 5), next.maxAttempts],
            [Number(previous.automatic_trusted_verification ?? 0), next.automaticTrustedVerification ? 1 : 0]
        ];
        return comparisons.some(([before, after]) => before !== after);
    }

    setupRequired() { return `<section class="hero"><p class="eyebrow">Dashboard setup</p><h1>Connect Discord OAuth</h1><p>Add <code>DISCORD_CLIENT_SECRET</code> and <code>DASHBOARD_SESSION_SECRET</code>, then register <code>${escapeHtml(this.config.baseUrl)}/callback</code> as an OAuth redirect in the Discord Developer Portal.</p></section>`; }
    serverList(request) {
        const guilds = request.session.guilds.filter(item => this.client.guilds.cache.has(item.id));
        return `<section class="hero"><p class="eyebrow">Community security</p><h1>Choose a server</h1><p>Configure verification, review activity, and monitor bot health.</p></section><section class="server-grid">${guilds.map(guild => `<a class="server-card" href="/guild/${guild.id}"><div class="server-icon">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div><div><h2>${escapeHtml(guild.name)}</h2><p>Manage verification</p></div><span>→</span></a>`).join("") || "<div class=\"panel\"><p>No shared manageable servers were found.</p></div>"}</section>`;
    }

    async overview(guildId, filters = {}) {
        const [successes, failures, recent, settings, daily, failureReasons, securityEvents, trustPolicies, reportDeliveries, reverifications] = await Promise.all([
            this.client.database.logs.getSuccessCount(guildId),
            this.client.database.logs.getFailureCount(guildId),
            this.client.database.logs.search(guildId, filters),
            this.client.database.guilds.getSettings(guildId),
            this.client.database.logs.getDailyCounts(guildId, 7),
            this.client.database.logs.getTopFailureReasons(guildId, 5),
            this.client.database.securityEvents.recent(guildId, 10),
            this.client.database.trustPolicies.listForGuild(guildId),
            this.client.database.reportDeliveries.recent(guildId, 10),
            this.client.database.reverifications.listForGuild(guildId, 100)
        ]);
        const total = successes + failures;
        return {
            successes,
            failures,
            total,
            successRate: total ? Number((successes / total * 100).toFixed(1)) : 0,
            active: (await this.client.database.captchas.getAll()).filter(item => item.guild_id === guildId).length,
            recent,
            settings,
            daily,
            failureReasons,
            securityEvents,
            trustPolicies,
            reportDeliveries,
            reverifications
        };
    }

    async guildPage(request) {
        const guild = request.dashboardGuild;
        const data = await this.overview(guild.id);
        const channels = guild.channels.cache.filter(channel => channel.isTextBased() && !channel.isThread()).map(channel => `<option value="${channel.id}" ${data.settings?.verify_channel_id === channel.id ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("");
        const logChannels = `<option value="">No log channel</option>${guild.channels.cache.filter(channel => channel.isTextBased() && !channel.isThread()).map(channel => `<option value="${channel.id}" ${data.settings?.log_channel_id === channel.id ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const roles = guild.roles.cache.filter(role => role.id !== guild.id && !role.managed).sort((a, b) => b.position - a.position).map(role => `<option value="${role.id}" ${data.settings?.verified_role_id === role.id ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("");
        const recent = data.recent.map(item => `<tr><td><span class="status ${item.success ? "success" : "failed"}">${item.success ? "Verified" : "Failed"}</span></td><td>${escapeHtml(item.user_id)}</td><td>${escapeHtml(item.failure_reason || "—")}</td><td>${new Date(item.timestamp < 1e12 ? item.timestamp * 1000 : item.timestamp).toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="4">No verification activity yet.</td></tr>`;
        return `${request.query.saved ? '<div class="notice">Verification settings published.</div>' : ""}<section class="guild-heading"><div><a href="/">← Servers</a><p class="eyebrow">Gatekeeper</p><h1>Verification overview</h1></div><span class="live"><i></i> Bot online</span></section><section class="metrics"><article><span>Successful</span><strong>${data.successes}</strong><small>${data.successRate}% success rate</small></article><article><span>Failed</span><strong>${data.failures}</strong><small>All recorded attempts</small></article><article><span>Active challenges</span><strong>${data.active}</strong><small>Awaiting answers</small></article><article><span>Total attempts</span><strong>${data.total}</strong><small>Lifetime activity</small></article></section><section class="dashboard-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Configuration</p><h2>Verification flow</h2></div></div><form method="post" action="/guild/${guild.id}/settings"><input type="hidden" name="csrf" value="${request.session.csrf}"><label>Verification channel<select name="verifyChannelId" required>${channels}</select></label><label>Verified role<select name="verifiedRoleId" required>${roles}</select></label><label>Log channel<select name="logChannelId">${logChannels}</select></label><button type="submit">Publish configuration</button></form></article><article class="panel activity"><div class="panel-title"><div><p class="eyebrow">Recent events</p><h2>Verification activity</h2></div></div><div class="table-wrap"><table><thead><tr><th>Result</th><th>User ID</th><th>Reason</th><th>Time</th></tr></thead><tbody>${recent}</tbody></table></div></article></section>`;
    }

    async setupWizard(request) {
        const guild = request.dashboardGuild;
        const settings = await this.client.database.guilds.getSettings(guild.id) || {};
        const healthService = this.client.configurationHealthService || new ConfigurationHealthService(this.client);
        const health = await healthService.validate(guild, settings);
        const channels = guild.channels.cache.filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${settings.verify_channel_id === channel.id ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("");
        const logChannels = `<option value="">No log channel</option>${guild.channels.cache.filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${settings.log_channel_id === channel.id ? "selected" : ""}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const roles = guild.roles.cache.filter(role => role.id !== guild.id && !role.managed).sort((a, b) => b.position - a.position)
            .map(role => `<option value="${role.id}" ${settings.verified_role_id === role.id ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("");
        const preset = settings.verification_preset || health.recommendedPreset;
        const checks = health.checks.map(check => `<li class="wizard-check ${check.ok ? "passed" : "failed"}"><i>${check.ok ? "✓" : "!"}</i><div><strong>${escapeHtml(check.label)}</strong>${check.ok ? "" : `<small>${escapeHtml(check.fix)}</small>`}</div></li>`).join("");
        return `<section class="wizard-shell"><div class="wizard-heading"><a href="/guild/${guild.id}">← Back to dashboard</a><p class="eyebrow">Guided deployment</p><h1>Configure Gatekeeper</h1><p>Four focused steps to launch a healthy verification flow.</p></div><ol class="wizard-progress" aria-label="Setup progress"><li class="active"><span>01</span>Assess</li><li><span>02</span>Connect</li><li><span>03</span>Secure</li><li><span>04</span>Launch</li></ol><form id="setupWizard" method="post" action="/guild/${guild.id}/setup"><input type="hidden" name="csrf" value="${request.session.csrf}"><section class="wizard-step active" data-wizard-step="0"><article class="panel"><p class="eyebrow">Server assessment</p><h2>${escapeHtml(guild.name)} is ready to begin</h2><div class="wizard-score"><strong>${health.score}</strong><span>Current health<br><small>${escapeHtml(health.status.replaceAll("_", " "))}</small></span></div><p>Based on ${guild.memberCount} members and the current protection settings, Gatekeeper recommends the <b>${health.recommendedPreset}</b> preset.</p><ul class="wizard-checks">${checks}</ul></article></section><section class="wizard-step" data-wizard-step="1" hidden><article class="panel"><p class="eyebrow">Discord connection</p><h2>Choose the verification destination</h2><div class="form-grid"><label>Verification channel<select id="wizardVerifyChannel" name="verifyChannelId" required>${channels}</select><small>Gatekeeper will publish and pin the verification message here.</small></label><label>Verified role<select id="wizardVerifiedRole" name="verifiedRoleId" required>${roles}</select><small>Members receive this role after completing verification.</small></label><label class="full">Log channel<select name="logChannelId">${logChannels}</select><small>Optional security and moderation activity destination.</small></label></div></article></section><section class="wizard-step" data-wizard-step="2" hidden><article class="panel"><p class="eyebrow">Protection level</p><h2>Select a security preset</h2><div class="preset-cards"><label><input type="radio" name="verificationPreset" value="BASIC" ${preset === "BASIC" ? "checked" : ""}><span>${health.recommendedPreset === "BASIC" ? "<em>Recommended</em>" : ""}<b>Basic</b><small>Low friction for small, private communities.</small></span></label><label><input type="radio" name="verificationPreset" value="STANDARD" ${preset === "STANDARD" ? "checked" : ""}><span>${health.recommendedPreset === "STANDARD" ? "<em>Recommended</em>" : ""}<b>Standard</b><small>Balanced CAPTCHA and account screening.</small></span></label><label><input type="radio" name="verificationPreset" value="STRICT" ${preset === "STRICT" ? "checked" : ""}><span>${health.recommendedPreset === "STRICT" ? "<em>Recommended</em>" : ""}<b>Strict</b><small>Hardened checks for public or high-risk servers.</small></span></label></div></article></section><section class="wizard-step" data-wizard-step="3" hidden><article class="panel"><p class="eyebrow">Launch review</p><h2>Confirm your verification flow</h2><div class="launch-review"><div><span>Channel</span><strong id="wizardChannelReview">Select a channel</strong></div><div><span>Role</span><strong id="wizardRoleReview">Select a role</strong></div><div><span>Preset</span><strong id="wizardPresetReview">${escapeHtml(preset)}</strong></div></div><div class="discord-preview wizard-preview"><div class="discord-avatar">G</div><div class="discord-message"><div><strong>Gatekeeper</strong><span class="bot-tag">APP</span><time>Now</time></div><div class="discord-embed"><h3>${escapeHtml(settings.message_title || "Server Verification")}</h3><p>${escapeHtml(settings.message_description || "Complete the CAPTCHA below to gain access to the server.")}</p><small>Powered by SecureBootLabs</small></div><button type="button" class="discord-button">✓ ${escapeHtml(settings.button_label || "Verify")}</button></div></div><p class="safe-test-note">Launching publishes the verification message and saves this configuration. No member roles are changed by the wizard.</p></article></section><div class="wizard-actions"><button id="wizardBack" type="button" class="secondary-button" hidden>Back</button><span>Step <b id="wizardStepNumber">1</b> of 4</span><button id="wizardNext" type="button">Continue</button><button id="wizardLaunch" type="submit" hidden>Launch Gatekeeper</button></div></form></section><script src="/dashboard.js" defer></script>`;
    }

    async guildPageV2(request) {
        const guild = request.dashboardGuild;
        const filters = {
            result: ["all", "success", "failed"].includes(request.query.result) ? request.query.result : "all",
            userId: String(request.query.userId || "").replace(/[^0-9]/g, "").slice(0, 20),
            limit: 25
        };
        const data = await this.overview(guild.id, filters);
        const settings = data.settings || {};
        const healthService = this.client.configurationHealthService || new ConfigurationHealthService(this.client);
        const configurationHealth = await healthService.validate(guild, settings);
        const selected = (current, value) => current === value ? "selected" : "";
        const channelOptions = guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.verify_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("");
        const logChannelOptions = `<option value="">No log channel</option>${guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.log_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const reportChannelOptions = `<option value="">Use log channel</option>${guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.report_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const reverificationChannelOptions = `<option value="">DM only</option>${guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.reverification_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const roleOptions = guild.roles.cache
            .filter(role => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map(role => `<option value="${role.id}" ${selected(settings.verified_role_id, role.id)}>${escapeHtml(role.name)}</option>`).join("");
        const trustRoleOptions = guild.roles.cache.filter(role => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map(role => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join("");
        const memberId = String(request.query.memberId || "").replace(/[^0-9]/g, "").slice(0, 20);
        const moderationMember = memberId ? await guild.members.fetch(memberId).catch(() => null) : null;
        const moderationStatus = moderationMember ? await ModerationService.status(this.client, moderationMember) : null;
        const activityRows = data.recent.map(item => `<tr><td><span class="status ${item.success ? "success" : "failed"}">${item.success ? "Verified" : "Failed"}</span></td><td><code>${escapeHtml(item.user_id)}</code></td><td>${escapeHtml(item.failure_reason || "—")}</td><td>${new Date(item.timestamp < 1e12 ? item.timestamp * 1000 : item.timestamp).toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="4" class="empty-state">No matching verification activity.</td></tr>`;
        const days = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - index));
            return date.toISOString().slice(0, 10);
        });
        const dailyMap = new Map(data.daily.map(row => [row.day, row]));
        const peak = Math.max(1, ...data.daily.map(row => Number(row.successes) + Number(row.failures)));
        const chart = days.map(day => {
            const row = dailyMap.get(day) || { successes: 0, failures: 0 };
            const successes = Number(row.successes);
            const failures = Number(row.failures);
            const successHeight = Math.max(successes ? 8 : 0, successes / peak * 100);
            const failureHeight = Math.max(failures ? 8 : 0, failures / peak * 100);
            return `<div class="chart-day" title="${day}: ${successes} successful, ${failures} failed"><div class="chart-bars"><i class="bar-success" style="height:${successHeight}%"></i><i class="bar-failed" style="height:${failureHeight}%"></i></div><span>${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span></div>`;
        }).join("");
        const failureRows = data.failureReasons.map(row => `<li><span>${escapeHtml(row.reason)}</span><strong>${row.count}</strong></li>`).join("") || "<li><span>No failures recorded</span><strong>0</strong></li>";
        const enabled = settings.verification_enabled !== 0;
        const title = settings.message_title || "Server Verification";
        const description = settings.message_description || "Complete the CAPTCHA below to gain access to the server.";
        const color = settings.message_color || "#5865F2";
        const buttonLabel = settings.button_label || "Verify";
        const notice = request.query.setupComplete ? '<div class="notice">Setup complete. Gatekeeper is configured and the verification message is live.</div>' : request.query.test === "passed" ? '<div class="notice">Configuration test passed. No member roles or data were changed.</div>' : request.query.test === "failed" ? `<div class="notice warning">Configuration test found ${Number(request.query.issues) || 1} issue(s). Review the health panel below.</div>` : request.query.saved ? '<div class="notice">Settings saved and the verification message was republished.</div>' : request.query.policySaved ? '<div class="notice">Trust policy saved.</div>' : request.query.moderated ? '<div class="notice">Moderation action completed.</div>' : request.query.reverificationUpdated ? '<div class="notice">Reverification queue updated.</div>' : "";
        const raidEnabled = settings.raid_protection_enabled === 1;
        const highAlertActive = Number(settings.high_alert_until) > Date.now();
        const raidStatus = highAlertActive ? `High alert until ${new Date(Number(settings.high_alert_until)).toLocaleTimeString()}` : raidEnabled ? "Monitoring joins" : "Monitoring disabled";
        const verificationPreset = ["BASIC", "STANDARD", "STRICT"].includes(settings.verification_preset) ? settings.verification_preset : "STANDARD";
        const presetPreview = verificationPreset === "BASIC"
            ? "Easy CAPTCHA · explicit trust/deny policies · no account-age block"
            : verificationPreset === "STRICT"
                ? `Hard CAPTCHA · maximum 3 attempts · minimum ${settings.strict_minimum_account_age_days ?? 7}-day account age · blocking enabled`
                : "Configured CAPTCHA and account-screening rules · high-alert enforcement when active";
        const securityRows = data.securityEvents.map(event => `<tr><td><span class="status ${event.type.includes("DISABLED") ? "failed" : "success"}">${escapeHtml(event.type.replaceAll("_", " "))}</span></td><td>${escapeHtml(event.details || "—")}</td><td>${new Date(Number(event.timestamp)).toLocaleString()}</td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">No security events recorded.</td></tr>';
        const policyRows = data.trustPolicies.map(policy => { const expired = Number(policy.expires_at) > 0 && Number(policy.expires_at) <= Date.now(); return `<tr><td><span class="status ${policy.policy === "DENY" ? "failed" : "success"}">${escapeHtml(policy.policy)}</span></td><td>${escapeHtml(policy.subject_type)}</td><td><code>${escapeHtml(policy.subject_id)}</code></td><td>${expired ? "Expired" : Number(policy.expires_at) ? new Date(Number(policy.expires_at)).toLocaleString() : "Never"}</td><td>${escapeHtml(policy.reason || "—")}</td><td><form method="post" action="/guild/${guild.id}/policies"><input type="hidden" name="csrf" value="${request.session.csrf}"><input type="hidden" name="policyAction" value="remove"><input type="hidden" name="subjectType" value="${escapeHtml(policy.subject_type)}"><input type="hidden" name="subjectId" value="${escapeHtml(policy.subject_id)}"><button type="submit" class="secondary-button">Remove</button></form></td></tr>`; }).join("") || '<tr><td colspan="6" class="empty-state">No trust or deny policies configured.</td></tr>';
        const moderationResult = moderationStatus ? `<div class="member-result"><strong>${escapeHtml(moderationMember.user.username)}</strong><code>${escapeHtml(moderationMember.id)}</code><span>Verified: ${moderationStatus.verified ? "Yes" : "No"}</span><span>Active challenge: ${moderationStatus.activeChallenge ? "Yes" : "No"}</span><span>Locked: ${moderationStatus.lockedUntil > Date.now() ? "Yes" : "No"}</span><span>Policy: ${escapeHtml(moderationStatus.policyAction)}${moderationStatus.policySource ? ` (${escapeHtml(moderationStatus.policySource)})` : ""}</span><span>Policy version: ${moderationStatus.verificationRecord ? moderationStatus.verificationRecord.policy_version : "None"} / ${settings.policy_version ?? 1}</span><span>Reverification due: ${moderationStatus.needsReverification ? "Yes" : "No"}</span></div><form method="post" action="/guild/${guild.id}/moderation"><input type="hidden" name="csrf" value="${request.session.csrf}"><input type="hidden" name="userId" value="${escapeHtml(moderationMember.id)}"><div class="form-grid"><label>Action<select name="moderationAction"><option value="verify">Verify member</option><option value="unverify">Remove verified role</option><option value="reset">Reset challenge and lockout</option><option value="reverify">Require reverification</option></select></label><label>Moderator note<input name="moderatorNote" maxlength="250" placeholder="Optional audit note"></label><label class="full confirmation"><input type="checkbox" name="confirmation"><span>Confirm role removal, reset, or reverification. Manual verification does not require confirmation.</span></label></div><button type="submit">Apply moderation action</button></form>` : memberId ? '<p class="empty-state">That member was not found in this server.</p>' : "";
        const deliveryRows = data.reportDeliveries.map(delivery => `<tr><td>${escapeHtml(delivery.delivery_type.replaceAll("_", " "))}</td><td>${escapeHtml(delivery.period || "—")}</td><td><span class="status ${delivery.success ? "success" : "failed"}">${delivery.success ? "Delivered" : "Failed"}</span></td><td>${delivery.attempts}</td><td>${escapeHtml(delivery.error || "—")}</td><td>${new Date(Number(delivery.timestamp)).toLocaleString()}</td></tr>`).join("") || '<tr><td colspan="6" class="empty-state">No report deliveries recorded.</td></tr>';
        const reverificationRows = data.reverifications.map(item => `<tr><td><code>${escapeHtml(item.user_id)}</code></td><td>${escapeHtml(item.reason.replaceAll("_", " "))}</td><td>${new Date(Number(item.due_at)).toLocaleString()}</td><td>${item.reminder_count}</td><td><form method="post" action="/guild/${guild.id}/reverification"><input type="hidden" name="csrf" value="${request.session.csrf}"><input type="hidden" name="reverificationAction" value="cancel"><input type="hidden" name="userId" value="${escapeHtml(item.user_id)}"><button class="secondary-button" type="submit">Cancel</button></form></td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">No members are awaiting reverification.</td></tr>';
        const healthIssues = configurationHealth.issues.map(issue => `<li><i>!</i><div><strong>${escapeHtml(issue.label)}</strong><small>${escapeHtml(issue.fix)}</small></div></li>`).join("") || '<li class="healthy"><i>✓</i><div><strong>All systems operational</strong><small>Channels, roles, permissions, and hierarchy passed.</small></div></li>';

        return `${notice}
        <section class="guild-heading"><div><a href="/">← Servers</a><p class="eyebrow">Gatekeeper</p><h1>Verification overview</h1></div><span class="live ${highAlertActive ? "alert" : ""}"><i></i> ${escapeHtml(raidStatus)}</span></section>
        <div class="dashboard-menu"><button id="dashboardMenuButton" class="cyber-menu-button" type="button" aria-expanded="false" aria-controls="dashboardTabs"><span class="cyber-menu-icon" aria-hidden="true"><i></i><i></i><i></i><b></b></span><span class="menu-copy"><small>Gatekeeper console</small><strong>Navigation</strong></span><em>OPEN</em></button><nav id="dashboardTabs" class="dashboard-tabs" role="tablist" aria-label="Dashboard sections" hidden><button type="button" role="tab" data-dashboard-tab="overview"><span>01</span>Overview</button><button type="button" role="tab" data-dashboard-tab="settings"><span>02</span>Settings</button><button type="button" role="tab" data-dashboard-tab="reverification"><span>03</span>Reverification</button><button type="button" role="tab" data-dashboard-tab="policies"><span>04</span>Policies</button><button type="button" role="tab" data-dashboard-tab="moderation"><span>05</span>Moderation</button><button type="button" role="tab" data-dashboard-tab="activity"><span>06</span>Activity</button></nav></div>
        <div class="dashboard-panel" data-dashboard-panel="overview">
        <section id="overview" class="metrics"><article><span>Successful</span><strong>${data.successes}</strong><small>${data.successRate}% success rate</small></article><article><span>Failed</span><strong>${data.failures}</strong><small>All recorded attempts</small></article><article><span>Active challenges</span><strong>${data.active}</strong><small>Awaiting answers</small></article><article><span>Total attempts</span><strong>${data.total}</strong><small>Lifetime activity</small></article></section>
        <section class="analytics-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Last seven days</p><h2>Verification volume</h2></div><div class="legend"><span><i class="success-dot"></i>Success</span><span><i class="failed-dot"></i>Failed</span></div></div><div class="chart">${chart}</div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Friction</p><h2>Failure reasons</h2></div></div><ul class="failure-list">${failureRows}</ul></article></section><section class="health-panel panel"><div class="health-score ${configurationHealth.status.toLowerCase()}"><strong>${configurationHealth.score}</strong><span>Health score</span></div><div class="health-content"><div class="panel-title"><div><p class="eyebrow">Configuration diagnostics</p><h2>${escapeHtml(configurationHealth.status.replaceAll("_", " "))}</h2></div><a class="secondary-button" href="/guild/${guild.id}/setup">${settings.setup_completed_at ? "Rerun setup" : "Start setup"}</a></div><ul class="health-issues">${healthIssues}</ul><div class="health-actions"><form method="post" action="/guild/${guild.id}/health-test"><input type="hidden" name="csrf" value="${request.session.csrf}"><button type="submit">Run safe test</button></form><span>Checks the complete flow without assigning roles.</span></div></div></section>
        </div><form id="configuration" class="settings-form dashboard-panel" data-dashboard-panel="settings" method="post" action="/guild/${guild.id}/settings" hidden><input type="hidden" name="csrf" value="${request.session.csrf}">
        <section class="settings-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Core setup</p><h2>Verification flow</h2></div><label class="toggle"><input type="checkbox" name="verificationEnabled" ${enabled ? "checked" : ""}><span></span><b>${enabled ? "Enabled" : "Disabled"}</b></label></div><div class="form-grid"><label>Verification channel<select name="verifyChannelId" required>${channelOptions}</select></label><label>Verified role<select name="verifiedRoleId" required>${roleOptions}</select></label><label class="full">Log channel<select name="logChannelId">${logChannelOptions}</select></label></div></article><article class="panel preset-panel"><div class="panel-title"><div><p class="eyebrow">Policy level</p><h2>Verification preset</h2></div><span class="version-badge">Version ${settings.policy_version ?? 1}</span></div><div class="form-grid"><label>Preset<select name="verificationPreset"><option value="BASIC" ${selected(verificationPreset, "BASIC")}>Basic</option><option value="STANDARD" ${selected(verificationPreset, "STANDARD")}>Standard</option><option value="STRICT" ${selected(verificationPreset, "STRICT")}>Strict</option></select></label><label>Strict minimum account age<input type="number" name="strictMinimumAccountAgeDays" min="1" max="365" value="${settings.strict_minimum_account_age_days ?? 7}"></label><label>Reverify after (days)<input type="number" name="reverifyAfterDays" min="0" max="3650" value="${settings.reverify_after_days ?? 0}"><small>0 disables time-based reverification.</small></label><div class="full policy-preview"><strong>${escapeHtml(verificationPreset)} preview</strong><span>${escapeHtml(presetPreview)}</span></div></div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Safe automation</p><h2>Reverification enforcement</h2></div><label class="toggle"><input type="checkbox" name="reverificationEnforcementEnabled" ${settings.reverification_enforcement_enabled === 1 ? "checked" : ""}><span></span><b>${settings.reverification_enforcement_enabled === 1 ? "Enabled" : "Preview only"}</b></label></div><div class="form-grid compact"><label>Grace period (days)<input type="number" name="reverificationGraceDays" min="1" max="30" value="${settings.reverification_grace_days ?? 7}"></label><label>First reminder before due (days)<input type="number" name="reverificationReminderDays" min="1" max="30" value="${settings.reverification_reminder_days ?? 3}"></label><label>Reminder channel<select name="reverificationChannelId">${reverificationChannelOptions}</select></label><label class="toggle"><input type="checkbox" name="reverificationNotifyDm" ${settings.reverification_notify_dm !== 0 ? "checked" : ""}><span></span><b>Send direct-message reminders</b></label><label class="full toggle"><input type="checkbox" name="reverificationPaused" ${settings.reverification_paused === 1 ? "checked" : ""}><span></span><b>Pause enforcement and reminders</b></label><p class="full policy-preview">Preview mode builds the queue without contacting members or removing roles. Trusted users and roles are always exempt.</p></div></article>
        <article class="panel"><div class="panel-title"><div><p class="eyebrow">Challenge policy</p><h2>CAPTCHA security</h2></div></div><div class="form-grid compact"><label>Difficulty<select name="captchaDifficulty"><option ${selected(settings.captcha_difficulty, "EASY")}>EASY</option><option ${selected(settings.captcha_difficulty || "MEDIUM", "MEDIUM")}>MEDIUM</option><option ${selected(settings.captcha_difficulty, "HARD")}>HARD</option></select></label><label>Code length<input type="number" name="captchaLength" min="4" max="10" value="${settings.captcha_length || 6}"></label><label>Expires after (minutes)<input type="number" name="captchaExpirationMinutes" min="1" max="30" value="${settings.captcha_expiration_minutes || 5}"></label><label>Maximum attempts<input type="number" name="maxAttempts" min="1" max="10" value="${settings.max_attempts || 5}"></label><label>Retry cooldown (seconds)<input type="number" name="cooldownSeconds" min="0" max="300" value="${settings.cooldown_seconds ?? 30}"></label><label>Lockout (minutes)<input type="number" name="lockoutMinutes" min="1" max="1440" value="${settings.lockout_minutes || 10}"></label></div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Account screening</p><h2>New-account policy</h2></div></div><div class="form-grid"><label>Minimum account age (days)<input type="number" name="minimumAccountAgeDays" min="0" max="365" value="${settings.minimum_account_age_days ?? 0}"><small>Set to 0 to disable account-age screening.</small></label><label>Accounts below minimum<select name="suspiciousAccountAction"><option value="BLOCK" ${selected(settings.suspicious_account_action || "BLOCK", "BLOCK")}>Block verification</option><option value="LOG_ONLY" ${selected(settings.suspicious_account_action, "LOG_ONLY")}>Log only and allow</option></select></label><label>Trusted account age (days)<input type="number" name="trustedAccountAgeDays" min="1" max="3650" value="${settings.trusted_account_age_days ?? 90}"></label><label class="toggle"><input type="checkbox" name="automaticTrustedVerification" ${settings.automatic_trusted_verification === 1 ? "checked" : ""}><span></span><b>Automatic trusted verification</b></label><label class="full toggle"><input type="checkbox" name="removeVerifiedRoleOnDeny" ${settings.remove_verified_role_on_deny === 1 ? "checked" : ""}><span></span><b>Automatically remove verified role when a user is denied</b></label></div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Raid protection</p><h2>High-alert enforcement</h2></div><label class="toggle"><input type="checkbox" name="raidProtectionEnabled" ${raidEnabled ? "checked" : ""}><span></span><b>${raidEnabled ? "Enabled" : "Disabled"}</b></label></div><div class="form-grid compact"><label>Join threshold<input type="number" name="joinVelocityThreshold" min="3" max="100" value="${settings.join_velocity_threshold ?? 10}"></label><label>Time window (seconds)<input type="number" name="joinVelocityWindowSeconds" min="10" max="600" value="${settings.join_velocity_window_seconds ?? 60}"></label><label>High-alert duration (minutes)<input type="number" name="highAlertMinutes" min="1" max="120" value="${settings.high_alert_minutes ?? 10}"></label><label>Alert cooldown (minutes)<input type="number" name="raidAlertCooldownMinutes" min="1" max="1440" value="${settings.raid_alert_cooldown_minutes ?? 30}"></label><label>High-alert minimum account age<input type="number" name="highAlertMinimumAccountAgeDays" min="0" max="365" value="${settings.high_alert_minimum_account_age_days ?? 7}"></label><label>High-alert action<select name="highAlertAction"><option value="MONITOR" ${selected(settings.high_alert_action || "MONITOR", "MONITOR")}>Monitor only</option><option value="BLOCK" ${selected(settings.high_alert_action, "BLOCK")}>Block verification</option></select></label><label class="full">Status<input value="${escapeHtml(raidStatus)}" disabled></label><div class="full alert-actions"><button type="submit" name="manualHighAlert" value="enable" class="secondary-button">Enable high alert now</button><button type="submit" name="manualHighAlert" value="disable" class="secondary-button">Disable high alert</button></div></div></article><article id="reports" class="panel"><div class="panel-title"><div><p class="eyebrow">Delivery</p><h2>Security reports</h2></div><label class="toggle"><input type="checkbox" name="scheduledReportsEnabled" ${settings.scheduled_reports_enabled === 1 ? "checked" : ""}><span></span><b>${settings.scheduled_reports_enabled === 1 ? "Enabled" : "Disabled"}</b></label></div><div class="form-grid compact"><label>Report channel<select name="reportChannelId">${reportChannelOptions}</select></label><label>Frequency<select name="reportFrequency"><option value="DAILY" ${selected(settings.report_frequency, "DAILY")}>Daily</option><option value="WEEKLY" ${selected(settings.report_frequency || "WEEKLY", "WEEKLY")}>Weekly</option></select></label><label>Delivery hour (UTC)<input type="number" name="reportHourUtc" min="0" max="23" value="${settings.report_hour_utc ?? 12}"></label><label>Weekly delivery day<select name="reportWeekday"><option value="0" ${Number(settings.report_weekday) === 0 ? "selected" : ""}>Sunday</option><option value="1" ${Number(settings.report_weekday ?? 1) === 1 ? "selected" : ""}>Monday</option><option value="2" ${Number(settings.report_weekday) === 2 ? "selected" : ""}>Tuesday</option><option value="3" ${Number(settings.report_weekday) === 3 ? "selected" : ""}>Wednesday</option><option value="4" ${Number(settings.report_weekday) === 4 ? "selected" : ""}>Thursday</option><option value="5" ${Number(settings.report_weekday) === 5 ? "selected" : ""}>Friday</option><option value="6" ${Number(settings.report_weekday) === 6 ? "selected" : ""}>Saturday</option></select></label><label>Quiet hours start (UTC)<input type="number" name="quietHoursStartUtc" min="0" max="23" value="${settings.quiet_hours_start_utc ?? 0}"></label><label>Quiet hours end (UTC)<input type="number" name="quietHoursEndUtc" min="0" max="23" value="${settings.quiet_hours_end_utc ?? 0}"><small>Matching start/end disables quiet hours.</small></label><label>Minimum alert severity<select name="minimumAlertSeverity"><option value="INFO" ${selected(settings.minimum_alert_severity, "INFO")}>Info</option><option value="WARNING" ${selected(settings.minimum_alert_severity || "WARNING", "WARNING")}>Warning</option><option value="CRITICAL" ${selected(settings.minimum_alert_severity, "CRITICAL")}>Critical only</option></select></label></div></article></section>
        <section id="message" class="message-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Content</p><h2>Verification message</h2></div></div><div class="form-grid"><label class="full">Title<input id="messageTitle" name="messageTitle" maxlength="256" value="${escapeHtml(title)}"></label><label class="full">Description<textarea id="messageDescription" name="messageDescription" maxlength="4000" rows="6">${escapeHtml(description)}</textarea></label><label>Accent color<input id="messageColor" name="messageColor" type="color" value="${escapeHtml(color)}"></label><label>Button label<input id="buttonLabel" name="buttonLabel" maxlength="80" value="${escapeHtml(buttonLabel)}"></label><label class="full">Success message<textarea name="successMessage" maxlength="1000" rows="3">${escapeHtml(settings.success_message || "You have been verified successfully.")}</textarea></label></div></article>
        <article class="panel preview-panel"><div class="panel-title"><div><p class="eyebrow">Live preview</p><h2>Discord appearance</h2></div></div><div class="discord-preview"><div class="discord-avatar">S</div><div class="discord-message"><div><strong>Sentinel</strong><span class="bot-tag">APP</span><time>Today at 12:00 PM</time></div><div id="previewEmbed" class="discord-embed" style="border-color:${escapeHtml(color)}"><h3 id="previewTitle">${escapeHtml(title)}</h3><p id="previewDescription">${escapeHtml(description)}</p><small>Powered by SecureBootLabs</small></div><button id="previewButton" type="button" class="discord-button" ${enabled ? "" : "disabled"}>✓ ${escapeHtml(buttonLabel)}</button></div></div></article></section>
        <div class="save-bar"><div><strong>Publish changes</strong><span>Updates settings and replaces the pinned verification message.</span></div><button type="submit">Save and publish</button></div></form>
        <div class="dashboard-panel" data-dashboard-panel="reverification"><section id="reverification" class="panel activity full-activity"><div class="panel-title"><div><p class="eyebrow">Preview and control</p><h2>Reverification queue</h2></div><span class="version-badge">${data.reverifications.length} pending</span></div><div class="alert-actions"><form method="post" action="/guild/${guild.id}/reverification"><input type="hidden" name="csrf" value="${request.session.csrf}"><button type="submit" name="reverificationAction" value="scan" class="secondary-button">Scan now</button><button type="submit" name="reverificationAction" value="${settings.reverification_paused === 1 ? "resume" : "pause"}" class="secondary-button">${settings.reverification_paused === 1 ? "Resume automation" : "Pause automation"}</button></form></div><p>Members appear here before enforcement. Gatekeeper processes at most 25 members per hourly scan.</p><div class="table-wrap"><table><thead><tr><th>User ID</th><th>Reason</th><th>Due</th><th>Reminders</th><th></th></tr></thead><tbody>${reverificationRows}</tbody></table></div></section></div>
        <div class="dashboard-panel" data-dashboard-panel="policies"><section id="policies" class="panel policy-panel"><div class="panel-title"><div><p class="eyebrow">Access decisions</p><h2>Trust and deny policies</h2></div></div><form method="post" action="/guild/${guild.id}/policies"><input type="hidden" name="csrf" value="${request.session.csrf}"><div class="form-grid"><label>Policy<select name="policyAction"><option value="TRUST_USER">Trust user</option><option value="DENY_USER">Deny user</option><option value="TRUST_ROLE">Trust role</option></select></label><label>Discord user ID<input name="userId" inputmode="numeric" placeholder="Required for user policies"></label><label>Discord role<select name="roleId"><option value="">Required for role policies</option>${trustRoleOptions}</select></label><label>Expires after (days)<input type="number" name="durationDays" min="0" max="3650" value="0"><small>0 means the policy never expires.</small></label><label class="full">Administrator note<input name="policyReason" maxlength="250" placeholder="Optional reason"></label></div><button type="submit">Add policy</button></form><div class="table-wrap policy-table"><table><thead><tr><th>Policy</th><th>Subject</th><th>ID</th><th>Expires</th><th>Reason</th><th></th></tr></thead><tbody>${policyRows}</tbody></table></div></section></div>
        <div class="dashboard-panel" data-dashboard-panel="moderation"><section id="moderation" class="panel moderation-panel"><div class="panel-title"><div><p class="eyebrow">Member recovery</p><h2>Verification moderation</h2></div></div><form method="get"><div class="member-search"><input name="memberId" inputmode="numeric" value="${escapeHtml(memberId)}" placeholder="Discord member ID"><button type="submit">Look up member</button></div></form>${moderationResult}</section></div>
        <div class="dashboard-panel" data-dashboard-panel="activity">
        <section id="activity" class="panel activity full-activity"><div class="panel-title activity-heading"><div><p class="eyebrow">Audit trail</p><h2>Verification activity</h2></div><form class="filters" method="get"><label>Result<select name="result"><option value="all" ${selected(filters.result, "all")}>All results</option><option value="success" ${selected(filters.result, "success")}>Successful</option><option value="failed" ${selected(filters.result, "failed")}>Failed</option></select></label><label>User ID<input name="userId" inputmode="numeric" value="${escapeHtml(filters.userId)}" placeholder="Search user"></label><button type="submit" class="secondary-button">Filter</button></form></div><div class="table-wrap"><table><thead><tr><th>Result</th><th>User ID</th><th>Reason</th><th>Time</th></tr></thead><tbody>${activityRows}</tbody></table></div></section>
        <section class="panel activity full-activity security-events"><div class="panel-title"><div><p class="eyebrow">Security timeline</p><h2>Recent high-alert events</h2></div></div><div class="table-wrap"><table><thead><tr><th>Event</th><th>Details</th><th>Time</th></tr></thead><tbody>${securityRows}</tbody></table></div></section>
        <section class="panel activity full-activity report-history"><div class="panel-title"><div><p class="eyebrow">Delivery log</p><h2>Report history</h2></div></div><div class="table-wrap"><table><thead><tr><th>Type</th><th>Period</th><th>Status</th><th>Attempts</th><th>Error</th><th>Time</th></tr></thead><tbody>${deliveryRows}</tbody></table></div></section>
        </div>
        <script src="/dashboard.js" defer></script>`;
    }

    start() { return new Promise(resolve => { this.server = this.app.listen(this.config.port, this.config.host, () => { console.log(`Dashboard: ${this.config.baseUrl}`); resolve(); }); }); }
    stop() { return new Promise(resolve => this.server ? this.server.close(resolve) : resolve()); }
}

module.exports = DashboardServer;
