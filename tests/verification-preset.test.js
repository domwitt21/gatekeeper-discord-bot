const test = require("node:test");
const assert = require("node:assert/strict");
const VerificationPresetService = require("../src/services/VerificationPresetService");

test("Basic preset minimizes screening while retaining CAPTCHA", () => {
    const result = VerificationPresetService.resolve({ verification_preset: "BASIC", minimum_account_age_days: 30, captcha_difficulty: "HARD" });
    assert.equal(result.minimum_account_age_days, 0);
    assert.equal(result.captcha_difficulty, "EASY");
});

test("Standard preset preserves configured policy", () => {
    const result = VerificationPresetService.resolve({ verification_preset: "STANDARD", minimum_account_age_days: 14, captcha_difficulty: "MEDIUM" });
    assert.equal(result.minimum_account_age_days, 14);
    assert.equal(result.captcha_difficulty, "MEDIUM");
});

test("Strict preset hardens CAPTCHA and account age", () => {
    const result = VerificationPresetService.resolve({ verification_preset: "STRICT", minimum_account_age_days: 2,
        strict_minimum_account_age_days: 21, captcha_difficulty: "EASY", max_attempts: 7 });
    assert.equal(result.minimum_account_age_days, 21);
    assert.equal(result.captcha_difficulty, "HARD");
    assert.equal(result.max_attempts, 3);
    assert.equal(result.suspicious_account_action, "BLOCK");
});

test("policy version and age determine reverification", () => {
    const now = Date.UTC(2026, 0, 31);
    assert.equal(VerificationPresetService.needsReverification(null, { policy_version: 1 }, now), true);
    assert.equal(VerificationPresetService.needsReverification({ policy_version: 1, verified_at: now }, { policy_version: 2 }, now), true);
    assert.equal(VerificationPresetService.needsReverification({ policy_version: 2, verified_at: now - 31 * 86400000 }, { policy_version: 2, reverify_after_days: 30 }, now), true);
    assert.equal(VerificationPresetService.needsReverification({ policy_version: 2, verified_at: now }, { policy_version: 2, reverify_after_days: 30 }, now), false);
});
