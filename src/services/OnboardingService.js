const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const EmbedFactory = require("../ui/EmbedFactory");

class OnboardingService {
    constructor(client, options = {}) {
        this.client = client;
        this.timer = null;
        this.running = false;
        this.intervalMs = options.intervalMs || 60000;
        this.batchSize = options.batchSize || 25;
    }

    enabledFor(settings, triggerType) {
        if (Number(settings?.onboarding_enabled) !== 1) return false;
        if (triggerType.startsWith("TRUST_") && Number(settings.onboarding_include_trusted) !== 1) return false;
        if (triggerType === "MANUAL" && Number(settings.onboarding_include_manual) !== 1) return false;
        return true;
    }

    links(settings) {
        try {
            return JSON.parse(settings.onboarding_links_json || "[]").filter(link => link.label && /^https:\/\//i.test(link.url)).slice(0, 4);
        } catch { return []; }
    }

    text(value, member) {
        return String(value || "").replaceAll("{user}", `<@${member.id}>`).replaceAll("{server}", member.guild.name);
    }

    payload(member, settings, options = {}) {
        const fields = [];
        if (settings.onboarding_rules_text) fields.push({ name: "Start here", value: this.text(settings.onboarding_rules_text, member).slice(0, 1024) });
        const components = [];
        const buttons = this.links(settings).map(link => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(link.label.slice(0, 80)).setURL(link.url));
        if (Number(settings.onboarding_require_acknowledgement) === 1 && !options.followup) {
            buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Success).setCustomId(`onboarding_ack:${member.guild.id}`).setLabel(String(settings.onboarding_acknowledgement_text || "I understand").slice(0, 80)));
        }
        if (buttons.length) components.push(new ActionRowBuilder().addComponents(buttons.slice(0, 5)));
        const title = options.followup ? "A quick follow-up" : settings.onboarding_welcome_title || "Welcome to the server";
        const description = options.followup ? settings.onboarding_followup_message : settings.onboarding_welcome_message;
        return { embeds: [EmbedFactory.create({ title: this.text(title, member).slice(0, 256),
            description: this.text(description || "Welcome, {user}!", member).slice(0, 4096), fields })], components };
    }

    async assignSecondaryRole(member, settings) {
        if (!settings.onboarding_secondary_role_id || member.roles.cache.has(settings.onboarding_secondary_role_id)) return false;
        const role = member.guild.roles.cache.get(settings.onboarding_secondary_role_id);
        if (!role) return false;
        await member.roles.add(role, "Gatekeeper onboarding completed");
        return true;
    }

    async deliver(member, triggerType = "CAPTCHA") {
        const settings = await this.client.database.guilds.getSettings(member.guild.id);
        if (!this.enabledFor(settings, triggerType)) return { skipped: true };
        const mode = ["DM", "CHANNEL", "BOTH"].includes(settings.onboarding_delivery_mode) ? settings.onboarding_delivery_mode : "DM";
        const payload = this.payload(member, settings);
        const delivered = [];
        const errors = [];
        if (["DM", "BOTH"].includes(mode)) await member.send(payload).then(() => delivered.push("DM")).catch(error => errors.push(`DM: ${error.message}`));
        if (["CHANNEL", "BOTH"].includes(mode)) {
            const channel = await member.guild.channels.fetch(settings.onboarding_channel_id).catch(() => null);
            if (channel?.isTextBased()) await channel.send({ content: `${member}`, ...payload }).then(() => delivered.push("CHANNEL")).catch(error => errors.push(`Channel: ${error.message}`));
            else errors.push("Channel: unavailable");
        }
        const awaiting = Number(settings.onboarding_require_acknowledgement) === 1;
        if (!awaiting) await this.assignSecondaryRole(member, settings).catch(error => errors.push(`Role: ${error.message}`));
        const followupDueAt = Number(settings.onboarding_followup_enabled) === 1 && !awaiting
            ? Date.now() + Math.max(Number(settings.onboarding_followup_delay_minutes) || 60, 1) * 60000 : 0;
        const status = delivered.length ? errors.length ? "PARTIAL" : awaiting ? "AWAITING_ACK" : "DELIVERED" : "FAILED";
        const deliveryId = await this.client.database.onboardingDeliveries.create({ guildId: member.guild.id, userId: member.id,
            triggerType, destinations: delivered.join(","), status, error: errors.join("; "), followupDueAt });
        await this.client.database.securityEvents.record({ guildId: member.guild.id,
            type: delivered.length ? "ONBOARDING_DELIVERED" : "ONBOARDING_FAILED", details: `User ${member.id}; ${triggerType}; ${status}` });
        return { deliveryId, status, delivered, errors };
    }

    async acknowledge(interaction) {
        const guildId = interaction.customId?.split(":")[1] || interaction.guild?.id;
        const guild = this.client.guilds.cache.get(guildId) || interaction.guild;
        if (!guild) return interaction.reply({ content: "This onboarding server is no longer available.", ephemeral: true });
        const delivery = await this.client.database.onboardingDeliveries.latestAwaiting(guild.id, interaction.user.id);
        if (!delivery) return interaction.reply({ content: "This onboarding acknowledgment is no longer active.", ephemeral: true });
        const settings = await this.client.database.guilds.getSettings(guild.id);
        const member = await guild.members.fetch(interaction.user.id);
        await this.assignSecondaryRole(member, settings);
        const now = Date.now();
        const followupDueAt = Number(settings.onboarding_followup_enabled) === 1
            ? now + Math.max(Number(settings.onboarding_followup_delay_minutes) || 60, 1) * 60000 : 0;
        await this.client.database.onboardingDeliveries.acknowledge(delivery.delivery_id, now, followupDueAt);
        await this.client.database.securityEvents.record({ guildId: guild.id, type: "ONBOARDING_ACKNOWLEDGED", details: `User ${interaction.user.id}` });
        return interaction.reply({ content: "Onboarding acknowledged. Welcome to the community!", ephemeral: true });
    }

    async test(guild, settings) {
        const channel = settings.onboarding_channel_id ? await guild.channels.fetch(settings.onboarding_channel_id).catch(() => null) : null;
        const mode = settings.onboarding_delivery_mode || "DM";
        const issues = [];
        if (["CHANNEL", "BOTH"].includes(mode) && !channel?.isTextBased()) issues.push("Select an available onboarding channel.");
        if (settings.onboarding_secondary_role_id && !guild.roles.cache.has(settings.onboarding_secondary_role_id)) issues.push("The secondary role is unavailable.");
        if (!String(settings.onboarding_welcome_message || "").trim()) issues.push("Add a welcome message.");
        return { passed: issues.length === 0, issues };
    }

    async processFollowup(delivery) {
        const guild = this.client.guilds.cache.get(delivery.guild_id);
        const settings = guild ? await this.client.database.guilds.getSettings(guild.id) : null;
        const member = guild ? await guild.members.fetch(delivery.user_id).catch(() => null) : null;
        if (!guild || !settings || !member || Number(settings.onboarding_followup_enabled) !== 1) {
            await this.client.database.onboardingDeliveries.markFollowup(delivery.delivery_id, Date.now(), "Follow-up skipped; member, server, or setting unavailable");
            return;
        }
        const payload = this.payload(member, settings, { followup: true });
        const destinations = String(delivery.destinations || "DM").split(",");
        const failures = [];
        let delivered = 0;
        if (destinations.includes("DM")) await member.send(payload).then(() => delivered++).catch(failure => failures.push(`DM: ${failure.message}`));
        if (destinations.includes("CHANNEL")) {
            const channel = await guild.channels.fetch(settings.onboarding_channel_id).catch(() => null);
            if (channel?.isTextBased()) await channel.send({ content: `${member}`, ...payload }).then(() => delivered++).catch(failure => failures.push(`Channel: ${failure.message}`));
            else failures.push("Channel: unavailable");
        }
        const error = delivered ? failures.join("; ") || null : failures.join("; ") || "No delivery destination available";
        await this.client.database.onboardingDeliveries.markFollowup(delivery.delivery_id, Date.now(), error);
        await this.client.database.securityEvents.record({ guildId: guild.id, type: delivered ? "ONBOARDING_FOLLOWUP_DELIVERED" : "ONBOARDING_FOLLOWUP_FAILED",
            details: `User ${member.id}${error ? `; ${error}` : ""}` });
    }

    async tick(now = Date.now()) {
        if (this.running) return;
        this.running = true;
        try {
            for (const delivery of await this.client.database.onboardingDeliveries.dueFollowups(now, this.batchSize)) {
                await this.processFollowup(delivery).catch(error => console.error(`Onboarding follow-up failed for ${delivery.delivery_id}`, error));
            }
        } finally { this.running = false; }
    }

    start() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch(error => console.error("Onboarding scheduler failed", error)), this.intervalMs); this.timer.unref(); this.tick().catch(() => {}); }
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = OnboardingService;
