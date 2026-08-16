const crypto = require("crypto");
const path = require("path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const VerificationManager = require("../managers/VerificationManager");
const SQLiteSessionStore = require("./SQLiteSessionStore");

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
        this.app.post("/guild/:guildId/settings", this.requireGuild.bind(this), this.requireCsrf.bind(this), async (request, response, next) => {
            try {
                const guild = request.dashboardGuild;
                const dashboardSettings = this.parseSettings(request.body, request.session.user.id);
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
                response.redirect(`/guild/${guild.id}?saved=1`);
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
            updatedBy: userId
        };
    }

    setupRequired() { return `<section class="hero"><p class="eyebrow">Dashboard setup</p><h1>Connect Discord OAuth</h1><p>Add <code>DISCORD_CLIENT_SECRET</code> and <code>DASHBOARD_SESSION_SECRET</code>, then register <code>${escapeHtml(this.config.baseUrl)}/callback</code> as an OAuth redirect in the Discord Developer Portal.</p></section>`; }
    serverList(request) {
        const guilds = request.session.guilds.filter(item => this.client.guilds.cache.has(item.id));
        return `<section class="hero"><p class="eyebrow">Community security</p><h1>Choose a server</h1><p>Configure verification, review activity, and monitor bot health.</p></section><section class="server-grid">${guilds.map(guild => `<a class="server-card" href="/guild/${guild.id}"><div class="server-icon">${escapeHtml(guild.name.slice(0, 2).toUpperCase())}</div><div><h2>${escapeHtml(guild.name)}</h2><p>Manage verification</p></div><span>→</span></a>`).join("") || "<div class=\"panel\"><p>No shared manageable servers were found.</p></div>"}</section>`;
    }

    async overview(guildId, filters = {}) {
        const [successes, failures, recent, settings, daily, failureReasons] = await Promise.all([
            this.client.database.logs.getSuccessCount(guildId),
            this.client.database.logs.getFailureCount(guildId),
            this.client.database.logs.search(guildId, filters),
            this.client.database.guilds.getSettings(guildId),
            this.client.database.logs.getDailyCounts(guildId, 7),
            this.client.database.logs.getTopFailureReasons(guildId, 5)
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
            failureReasons
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

    async guildPageV2(request) {
        const guild = request.dashboardGuild;
        const filters = {
            result: ["all", "success", "failed"].includes(request.query.result) ? request.query.result : "all",
            userId: String(request.query.userId || "").replace(/[^0-9]/g, "").slice(0, 20),
            limit: 25
        };
        const data = await this.overview(guild.id, filters);
        const settings = data.settings || {};
        const selected = (current, value) => current === value ? "selected" : "";
        const channelOptions = guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.verify_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("");
        const logChannelOptions = `<option value="">No log channel</option>${guild.channels.cache
            .filter(channel => channel.isTextBased() && !channel.isThread())
            .map(channel => `<option value="${channel.id}" ${selected(settings.log_channel_id, channel.id)}># ${escapeHtml(channel.name)}</option>`).join("")}`;
        const roleOptions = guild.roles.cache
            .filter(role => role.id !== guild.id && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map(role => `<option value="${role.id}" ${selected(settings.verified_role_id, role.id)}>${escapeHtml(role.name)}</option>`).join("");
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
        const notice = request.query.saved ? '<div class="notice">Settings saved and the verification message was republished.</div>' : "";
        const raidEnabled = settings.raid_protection_enabled === 1;
        const highAlertActive = Number(settings.high_alert_until) > Date.now();
        const raidStatus = highAlertActive ? `High alert until ${new Date(Number(settings.high_alert_until)).toLocaleTimeString()}` : raidEnabled ? "Monitoring joins" : "Monitoring disabled";

        return `${notice}
        <section class="guild-heading"><div><a href="/">← Servers</a><p class="eyebrow">Gatekeeper</p><h1>Verification overview</h1></div><span class="live ${highAlertActive ? "alert" : ""}"><i></i> ${escapeHtml(raidStatus)}</span></section>
        <nav class="section-nav" aria-label="Dashboard sections"><a href="#overview">Overview</a><a href="#configuration">Configuration</a><a href="#message">Message</a><a href="#activity">Activity</a></nav>
        <section id="overview" class="metrics"><article><span>Successful</span><strong>${data.successes}</strong><small>${data.successRate}% success rate</small></article><article><span>Failed</span><strong>${data.failures}</strong><small>All recorded attempts</small></article><article><span>Active challenges</span><strong>${data.active}</strong><small>Awaiting answers</small></article><article><span>Total attempts</span><strong>${data.total}</strong><small>Lifetime activity</small></article></section>
        <section class="analytics-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Last seven days</p><h2>Verification volume</h2></div><div class="legend"><span><i class="success-dot"></i>Success</span><span><i class="failed-dot"></i>Failed</span></div></div><div class="chart">${chart}</div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Friction</p><h2>Failure reasons</h2></div></div><ul class="failure-list">${failureRows}</ul></article></section>
        <form id="configuration" class="settings-form" method="post" action="/guild/${guild.id}/settings"><input type="hidden" name="csrf" value="${request.session.csrf}">
        <section class="settings-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Core setup</p><h2>Verification flow</h2></div><label class="toggle"><input type="checkbox" name="verificationEnabled" ${enabled ? "checked" : ""}><span></span><b>${enabled ? "Enabled" : "Disabled"}</b></label></div><div class="form-grid"><label>Verification channel<select name="verifyChannelId" required>${channelOptions}</select></label><label>Verified role<select name="verifiedRoleId" required>${roleOptions}</select></label><label class="full">Log channel<select name="logChannelId">${logChannelOptions}</select></label></div></article>
        <article class="panel"><div class="panel-title"><div><p class="eyebrow">Challenge policy</p><h2>CAPTCHA security</h2></div></div><div class="form-grid compact"><label>Difficulty<select name="captchaDifficulty"><option ${selected(settings.captcha_difficulty, "EASY")}>EASY</option><option ${selected(settings.captcha_difficulty || "MEDIUM", "MEDIUM")}>MEDIUM</option><option ${selected(settings.captcha_difficulty, "HARD")}>HARD</option></select></label><label>Code length<input type="number" name="captchaLength" min="4" max="10" value="${settings.captcha_length || 6}"></label><label>Expires after (minutes)<input type="number" name="captchaExpirationMinutes" min="1" max="30" value="${settings.captcha_expiration_minutes || 5}"></label><label>Maximum attempts<input type="number" name="maxAttempts" min="1" max="10" value="${settings.max_attempts || 5}"></label><label>Retry cooldown (seconds)<input type="number" name="cooldownSeconds" min="0" max="300" value="${settings.cooldown_seconds ?? 30}"></label><label>Lockout (minutes)<input type="number" name="lockoutMinutes" min="1" max="1440" value="${settings.lockout_minutes || 10}"></label></div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Account screening</p><h2>New-account policy</h2></div></div><div class="form-grid"><label>Minimum account age (days)<input type="number" name="minimumAccountAgeDays" min="0" max="365" value="${settings.minimum_account_age_days ?? 0}"><small>Set to 0 to disable account-age screening.</small></label><label>Accounts below minimum<select name="suspiciousAccountAction"><option value="BLOCK" ${selected(settings.suspicious_account_action || "BLOCK", "BLOCK")}>Block verification</option><option value="LOG_ONLY" ${selected(settings.suspicious_account_action, "LOG_ONLY")}>Log only and allow</option></select></label></div></article><article class="panel"><div class="panel-title"><div><p class="eyebrow">Raid monitoring</p><h2>Join-velocity protection</h2></div><label class="toggle"><input type="checkbox" name="raidProtectionEnabled" ${raidEnabled ? "checked" : ""}><span></span><b>${raidEnabled ? "Enabled" : "Disabled"}</b></label></div><div class="form-grid compact"><label>Join threshold<input type="number" name="joinVelocityThreshold" min="3" max="100" value="${settings.join_velocity_threshold ?? 10}"></label><label>Time window (seconds)<input type="number" name="joinVelocityWindowSeconds" min="10" max="600" value="${settings.join_velocity_window_seconds ?? 60}"></label><label>High-alert duration (minutes)<input type="number" name="highAlertMinutes" min="1" max="120" value="${settings.high_alert_minutes ?? 10}"></label><label>Status<input value="${escapeHtml(raidStatus)}" disabled></label><label class="full"><small>Monitor-only mode: Gatekeeper records and reports bursts but does not automatically block members.</small></label></div></article></section>
        <section id="message" class="message-grid"><article class="panel"><div class="panel-title"><div><p class="eyebrow">Content</p><h2>Verification message</h2></div></div><div class="form-grid"><label class="full">Title<input id="messageTitle" name="messageTitle" maxlength="256" value="${escapeHtml(title)}"></label><label class="full">Description<textarea id="messageDescription" name="messageDescription" maxlength="4000" rows="6">${escapeHtml(description)}</textarea></label><label>Accent color<input id="messageColor" name="messageColor" type="color" value="${escapeHtml(color)}"></label><label>Button label<input id="buttonLabel" name="buttonLabel" maxlength="80" value="${escapeHtml(buttonLabel)}"></label><label class="full">Success message<textarea name="successMessage" maxlength="1000" rows="3">${escapeHtml(settings.success_message || "You have been verified successfully.")}</textarea></label></div></article>
        <article class="panel preview-panel"><div class="panel-title"><div><p class="eyebrow">Live preview</p><h2>Discord appearance</h2></div></div><div class="discord-preview"><div class="discord-avatar">S</div><div class="discord-message"><div><strong>Sentinel</strong><span class="bot-tag">APP</span><time>Today at 12:00 PM</time></div><div id="previewEmbed" class="discord-embed" style="border-color:${escapeHtml(color)}"><h3 id="previewTitle">${escapeHtml(title)}</h3><p id="previewDescription">${escapeHtml(description)}</p><small>Powered by SecureBootLabs</small></div><button id="previewButton" type="button" class="discord-button" ${enabled ? "" : "disabled"}>✓ ${escapeHtml(buttonLabel)}</button></div></div></article></section>
        <div class="save-bar"><div><strong>Publish changes</strong><span>Updates settings and replaces the pinned verification message.</span></div><button type="submit">Save and publish</button></div></form>
        <section id="activity" class="panel activity full-activity"><div class="panel-title activity-heading"><div><p class="eyebrow">Audit trail</p><h2>Verification activity</h2></div><form class="filters" method="get"><label>Result<select name="result"><option value="all" ${selected(filters.result, "all")}>All results</option><option value="success" ${selected(filters.result, "success")}>Successful</option><option value="failed" ${selected(filters.result, "failed")}>Failed</option></select></label><label>User ID<input name="userId" inputmode="numeric" value="${escapeHtml(filters.userId)}" placeholder="Search user"></label><button type="submit" class="secondary-button">Filter</button></form></div><div class="table-wrap"><table><thead><tr><th>Result</th><th>User ID</th><th>Reason</th><th>Time</th></tr></thead><tbody>${activityRows}</tbody></table></div></section>
        <script src="/dashboard.js" defer></script>`;
    }

    start() { return new Promise(resolve => { this.server = this.app.listen(this.config.port, this.config.host, () => { console.log(`Dashboard: ${this.config.baseUrl}`); resolve(); }); }); }
    stop() { return new Promise(resolve => this.server ? this.server.close(resolve) : resolve()); }
}

module.exports = DashboardServer;
