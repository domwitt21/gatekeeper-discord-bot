const { PermissionFlagsBits } = require("discord.js");

class ConfigurationHealthService {
    constructor(client, options = {}) {
        this.client = client;
        this.timer = null;
        this.running = false;
        this.intervalMs = options.intervalMs || 6 * 60 * 60 * 1000;
    }

    recommendedPreset(guild, settings = {}) {
        if (Number(settings.raid_protection_enabled) === 1 || Number(guild.memberCount) >= 1000) return "STRICT";
        if (Number(guild.memberCount) <= 25) return "BASIC";
        return "STANDARD";
    }

    async validate(guild, settings = {}) {
        const checks = [];
        const add = (key, ok, label, fix, critical = true) => checks.push({ key, ok: Boolean(ok), label, fix, critical });
        const verifyChannel = settings.verify_channel_id ? await guild.channels.fetch(settings.verify_channel_id).catch(() => null) : null;
        const logChannel = settings.log_channel_id ? await guild.channels.fetch(settings.log_channel_id).catch(() => null) : null;
        const verifiedRole = settings.verified_role_id ? await guild.roles.fetch(settings.verified_role_id).catch(() => null) : null;
        const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
        const permissions = verifyChannel && botMember ? verifyChannel.permissionsFor(botMember) : null;
        add("verify_channel", verifyChannel?.isTextBased?.(), "Verification channel is available", "Select an active text channel.");
        add("verified_role", verifiedRole && !verifiedRole.managed, "Verified role is available", "Select a normal server role.");
        add("manage_roles", botMember?.permissions?.has(PermissionFlagsBits.ManageRoles), "Gatekeeper can manage roles", "Grant Gatekeeper the Manage Roles permission.");
        add("role_hierarchy", botMember && verifiedRole && botMember.roles.highest.position > verifiedRole.position,
            "Gatekeeper is above the verified role", "Move the Gatekeeper role above the verified role.");
        add("view_channel", permissions?.has(PermissionFlagsBits.ViewChannel), "Gatekeeper can view the verification channel", "Allow Gatekeeper to view the verification channel.");
        add("send_messages", permissions?.has(PermissionFlagsBits.SendMessages), "Gatekeeper can send verification messages", "Allow Send Messages in the verification channel.");
        add("embed_links", permissions?.has(PermissionFlagsBits.EmbedLinks), "Gatekeeper can send embeds", "Allow Embed Links in the verification channel.");
        add("attach_files", permissions?.has(PermissionFlagsBits.AttachFiles), "Gatekeeper can attach CAPTCHA images", "Allow Attach Files in the verification channel.");
        add("log_channel", !settings.log_channel_id || logChannel?.isTextBased?.(), "Log channel is available", "Select an active log channel or disable logging.", false);
        add("verification_enabled", Number(settings.verification_enabled) !== 0, "Verification is enabled", "Enable the verification flow.", false);
        const failedWeight = checks.reduce((total, check) => total + (!check.ok ? check.critical ? 15 : 5 : 0), 0);
        const score = Math.max(0, 100 - failedWeight);
        return { score, status: score === 100 ? "HEALTHY" : score >= 70 ? "NEEDS_ATTENTION" : "BLOCKED",
            checks, issues: checks.filter(check => !check.ok), recommendedPreset: this.recommendedPreset(guild, settings) };
    }

    async test(guild, settings) {
        const health = await this.validate(guild, settings);
        return { passed: health.issues.filter(issue => issue.critical).length === 0, health,
            message: health.issues.filter(issue => issue.critical).length === 0
                ? "The verification flow passed all required checks. No roles were assigned and no member data changed."
                : "The test found blocking configuration issues. No roles were assigned and no member data changed." };
    }

    async inspectGuild(guild, settings, now = Date.now()) {
        const health = await this.validate(guild, settings);
        const previousScore = Number(settings.last_health_score);
        await this.client.database.guilds.updateHealth(guild.id, health.score, now);
        const lastAlert = Number(settings.last_health_alert_at) || 0;
        const regressed = Number.isFinite(previousScore) && previousScore > health.score;
        if (health.score < 100 && (regressed || now - lastAlert >= 86400000)) {
            await this.client.database.securityEvents.record({ guildId: guild.id, type: "CONFIGURATION_HEALTH_WARNING",
                details: `Health ${health.score}/100; ${health.issues.map(issue => issue.key).join(", ")}` });
            await this.client.database.guilds.setLastHealthAlertAt(guild.id, now);
        }
        return health;
    }

    async tick(now = Date.now()) {
        if (this.running) return;
        this.running = true;
        try {
            for (const settings of await this.client.database.guilds.getAllSettings()) {
                const guild = this.client.guilds.cache.get(settings.guild_id);
                if (guild) await this.inspectGuild(guild, settings, now).catch(error => console.error(`Health check failed for ${guild.id}`, error));
            }
        } finally { this.running = false; }
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick().catch(error => console.error("Configuration health scheduler failed", error)), this.intervalMs);
        this.timer.unref();
        this.tick().catch(error => console.error("Initial configuration health check failed", error));
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = ConfigurationHealthService;
