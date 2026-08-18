const TrustPolicyService = require("./TrustPolicyService");
const VerificationPresetService = require("./VerificationPresetService");

const DAY_MS = 86400000;

class ReverificationService {
    constructor(client, options = {}) {
        this.client = client;
        this.timer = null;
        this.running = false;
        this.batchSize = options.batchSize || 25;
        this.intervalMs = options.intervalMs || 60 * 60 * 1000;
    }

    reason(record, settings, now = Date.now()) {
        if (Number(record.policy_version) < (Number(settings.policy_version) || 1)) return "POLICY_UPDATED";
        const days = Number(settings.reverify_after_days) || 0;
        if (days > 0 && now - Number(record.verified_at) >= days * DAY_MS) return "VERIFICATION_EXPIRED";
        return null;
    }

    async discoverGuild(guild, settings, now = Date.now()) {
        if (!settings.verified_role_id) return 0;
        const ageDays = Number(settings.reverify_after_days) || 0;
        const verifiedBefore = ageDays > 0 ? now - ageDays * DAY_MS : 0;
        const records = await this.client.database.verificationRecords.listReverificationCandidates(
            guild.id, Number(settings.policy_version) || 1, verifiedBefore, this.batchSize);
        const policies = await this.client.database.trustPolicies.listForGuild(guild.id);
        let discovered = 0;
        for (const record of records) {
            const reason = this.reason(record, settings, now);
            if (!reason) continue;
            const member = await guild.members.fetch(record.user_id).catch(() => null);
            if (!member || !member.roles.cache.has(settings.verified_role_id)) {
                await this.client.database.reverifications.remove(guild.id, record.user_id);
                continue;
            }
            if (TrustPolicyService.evaluate(member, settings, policies, now).action === "BYPASS") {
                await this.client.database.reverifications.remove(guild.id, member.id);
                continue;
            }
            const graceDays = Math.min(Math.max(Number(settings.reverification_grace_days) || 7, 1), 30);
            await this.client.database.reverifications.upsert({ guildId: guild.id, userId: member.id,
                detectedAt: now, dueAt: now + graceDays * DAY_MS, reason });
            discovered++;
        }
        return discovered;
    }

    shouldRemind(item, settings, now = Date.now()) {
        const reminderDays = Math.min(Math.max(Number(settings.reverification_reminder_days) || 3, 1), 30);
        return Number(item.due_at) - now <= reminderDays * DAY_MS &&
            now - Number(item.last_reminded_at || 0) >= DAY_MS;
    }

    async notify(member, settings, item) {
        const message = `Your verification in **${member.guild.name}** is out of date. Please verify again before <t:${Math.floor(Number(item.due_at) / 1000)}:F>.`;
        let delivered = false;
        if (Number(settings.reverification_notify_dm) === 1) {
            delivered = await member.send(message).then(() => true).catch(() => false);
        }
        if (settings.reverification_channel_id) {
            const channel = await member.guild.channels.fetch(settings.reverification_channel_id).catch(() => null);
            if (channel?.isTextBased()) delivered = await channel.send(`${member} ${message}`).then(() => true).catch(() => delivered);
        }
        return delivered;
    }

    async processItem(item, settings, now = Date.now()) {
        const guild = this.client.guilds.cache.get(item.guild_id);
        if (!guild) return { skipped: true };
        const member = await guild.members.fetch(item.user_id).catch(() => null);
        if (!member) {
            await this.client.database.reverifications.remove(item.guild_id, item.user_id);
            return { removed: true };
        }
        const policies = await this.client.database.trustPolicies.listForGuild(guild.id);
        if (TrustPolicyService.evaluate(member, settings, policies, now).action === "BYPASS") {
            await this.client.database.reverifications.remove(guild.id, member.id);
            return { exempt: true };
        }
        if (this.shouldRemind(item, settings, now)) {
            const delivered = await this.notify(member, settings, item);
            await this.client.database.reverifications.markReminded(guild.id, member.id, now);
            await this.client.database.securityEvents.record({ guildId: guild.id, type: "REVERIFICATION_REMINDER",
                details: `User ${member.id}; ${delivered ? "delivered" : "delivery failed"}` });
        }
        if (now < Number(item.due_at)) return { pending: true };
        const role = guild.roles.cache.get(settings.verified_role_id);
        if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, "Gatekeeper reverification grace period expired");
        await this.client.database.verificationRecords.remove(guild.id, member.id);
        await this.client.database.reverifications.markEnforced(guild.id, member.id, now);
        await this.client.database.securityEvents.record({ guildId: guild.id, type: "REVERIFICATION_ENFORCED",
            details: `User ${member.id}; ${item.reason}` });
        return { enforced: true };
    }

    async tick(now = Date.now()) {
        if (this.running) return;
        this.running = true;
        try {
            const settingsList = await this.client.database.guilds.getAllSettings();
            for (const settings of settingsList) {
                const guild = this.client.guilds.cache.get(settings.guild_id);
                if (!guild) continue;
                await this.discoverGuild(guild, settings, now);
                if (Number(settings.reverification_enforcement_enabled) !== 1 || Number(settings.reverification_paused) === 1) continue;
                const pending = await this.client.database.reverifications.listForGuild(guild.id, this.batchSize);
                for (const item of pending) await this.processItem(item, settings, now).catch(error => console.error(`Reverification failed for ${guild.id}/${item.user_id}`, error));
            }
        } finally { this.running = false; }
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick().catch(error => console.error("Reverification scheduler failed", error)), this.intervalMs);
        this.timer.unref();
        this.tick().catch(error => console.error("Initial reverification scan failed", error));
    }

    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

module.exports = ReverificationService;
