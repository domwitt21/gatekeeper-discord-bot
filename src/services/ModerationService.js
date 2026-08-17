const TrustPolicyService = require("./TrustPolicyService");

class ModerationService {
    static async settings(client, guildId) {
        const settings = await client.database.guilds.getSettings(guildId);
        if (!settings?.verified_role_id) throw new Error("Verification is not configured for this server.");
        return settings;
    }

    static async verify(client, member, actorId, note) {
        const settings = await this.settings(client, member.guild.id);
        await client.database.captchas.deleteActive(member.guild.id, member.id);
        client.verificationManager?.resetMemberState(member.guild.id, member.id);
        if (!member.roles.cache.has(settings.verified_role_id)) await member.roles.add(settings.verified_role_id);
        await this.audit(client, member.guild.id, "MANUAL_VERIFY", member.id, actorId, note);
        return { changed: true };
    }

    static async unverify(client, member, actorId, note) {
        const settings = await this.settings(client, member.guild.id);
        const changed = member.roles.cache.has(settings.verified_role_id);
        if (changed) await member.roles.remove(settings.verified_role_id);
        await this.audit(client, member.guild.id, "MANUAL_UNVERIFY", member.id, actorId, note);
        return { changed };
    }

    static async reset(client, member, actorId, note) {
        await client.database.captchas.deleteActive(member.guild.id, member.id);
        client.verificationManager?.resetMemberState(member.guild.id, member.id);
        await this.audit(client, member.guild.id, "VERIFICATION_RESET", member.id, actorId, note);
        return { changed: true };
    }

    static async status(client, member) {
        const settings = await this.settings(client, member.guild.id);
        const captcha = await client.database.captchas.findActive(member.guild.id, member.id);
        const policies = await client.database.trustPolicies.listForGuild(member.guild.id);
        const policyDecision = TrustPolicyService.evaluate(member, settings, policies);
        const manager = client.verificationManager;
        const key = manager?.sessionKey(member.guild.id, member.id);
        return {
            verified: member.roles.cache.has(settings.verified_role_id),
            activeChallenge: Boolean(captcha),
            lockedUntil: key ? manager.lockouts.get(key) || 0 : 0,
            cooldownUntil: key ? manager.answerCooldowns.get(key) || 0 : 0,
            policyAction: policyDecision.action,
            policySource: policyDecision.source || null
        };
    }

    static async revokeIfDenied(client, guild, userId, actorId, note) {
        const settings = await client.database.guilds.getSettings(guild.id);
        if (Number(settings?.remove_verified_role_on_deny) !== 1 || !settings.verified_role_id) return false;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || !member.roles.cache.has(settings.verified_role_id)) return false;
        await member.roles.remove(settings.verified_role_id);
        await this.audit(client, guild.id, "DENY_AUTO_UNVERIFY", userId, actorId, note);
        return true;
    }

    static audit(client, guildId, type, userId, actorId, note) {
        const details = `Member ${userId}; moderator ${actorId}${note ? `; note: ${String(note).slice(0, 250)}` : ""}`;
        return client.database.securityEvents.record({ guildId, type, details });
    }
}

module.exports = ModerationService;
