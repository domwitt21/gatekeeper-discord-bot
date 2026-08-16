const DAY_MS = 24 * 60 * 60 * 1000;

class TrustPolicyService {
    static evaluate(member, settings = {}, policies = [], now = Date.now()) {
        const active = policies.filter(policy => Number(policy.expires_at) === 0 || Number(policy.expires_at) > now);
        const userPolicies = active.filter(policy => policy.subject_type === "USER" && policy.subject_id === member.id);
        const denied = userPolicies.find(policy => policy.policy === "DENY");
        if (denied) return { action: "DENY", source: "USER", policy: denied };
        const trustedUser = userPolicies.find(policy => policy.policy === "TRUST");
        if (trustedUser) return { action: "BYPASS", source: "USER", policy: trustedUser };
        const roleIds = new Set(member.roles?.cache?.keys?.() || []);
        const trustedRole = active.find(policy => policy.policy === "TRUST" && policy.subject_type === "ROLE" && roleIds.has(policy.subject_id));
        if (trustedRole) return { action: "BYPASS", source: "ROLE", policy: trustedRole };
        const autoEnabled = Number(settings.automatic_trusted_verification) === 1;
        const minimumDays = Math.min(Math.max(Number.parseInt(settings.trusted_account_age_days, 10) || 90, 1), 3650);
        const createdTimestamp = Number(member.user?.createdTimestamp);
        if (autoEnabled && Number.isFinite(createdTimestamp) && now - createdTimestamp >= minimumDays * DAY_MS) {
            return { action: "BYPASS", source: "ACCOUNT_AGE", minimumDays };
        }
        return { action: "REQUIRE_VERIFICATION" };
    }
}

module.exports = TrustPolicyService;
