class VerificationPresetService {
    static resolve(settings = {}) {
        const preset = ["BASIC", "STANDARD", "STRICT"].includes(settings.verification_preset) ? settings.verification_preset : "STANDARD";
        const resolved = { ...settings, verification_preset: preset };
        if (preset === "BASIC") {
            resolved.minimum_account_age_days = 0;
            resolved.suspicious_account_action = "LOG_ONLY";
            resolved.captcha_difficulty = "EASY";
        }
        if (preset === "STRICT") {
            const strictDays = Math.min(Math.max(Number.parseInt(settings.strict_minimum_account_age_days, 10) || 7, 1), 365);
            resolved.minimum_account_age_days = Math.max(Number(settings.minimum_account_age_days) || 0, strictDays);
            resolved.suspicious_account_action = "BLOCK";
            resolved.captcha_difficulty = "HARD";
            resolved.max_attempts = Math.min(Number(settings.max_attempts) || 3, 3);
        }
        return resolved;
    }

    static needsReverification(record, settings = {}, now = Date.now()) {
        if (!record) return true;
        if (Number(record.policy_version) < (Number(settings.policy_version) || 1)) return true;
        const days = Number.parseInt(settings.reverify_after_days, 10) || 0;
        return days > 0 && now - Number(record.verified_at) >= days * 86400000;
    }
}

module.exports = VerificationPresetService;
