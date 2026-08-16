const test = require("node:test");
const assert = require("node:assert/strict");
const TrustPolicyService = require("../src/services/TrustPolicyService");

const NOW = Date.UTC(2026, 0, 1);
const member = (id = "user", roles = []) => ({ id, user: { createdTimestamp: NOW - 365 * 86400000 }, roles: { cache: new Map(roles.map(role => [role, {}])) } });

test("deny policy takes precedence over trust", () => {
    const result = TrustPolicyService.evaluate(member(), {}, [
        { subject_type: "USER", subject_id: "user", policy: "TRUST", expires_at: 0 },
        { subject_type: "USER", subject_id: "user", policy: "DENY", expires_at: 0 }
    ], NOW);
    assert.equal(result.action, "DENY");
});

test("trusted user and role policies bypass CAPTCHA", () => {
    assert.equal(TrustPolicyService.evaluate(member(), {}, [{ subject_type: "USER", subject_id: "user", policy: "TRUST", expires_at: 0 }], NOW).action, "BYPASS");
    assert.equal(TrustPolicyService.evaluate(member("user", ["role"]), {}, [{ subject_type: "ROLE", subject_id: "role", policy: "TRUST", expires_at: 0 }], NOW).action, "BYPASS");
});

test("expired policies are ignored", () => {
    const result = TrustPolicyService.evaluate(member(), {}, [{ subject_type: "USER", subject_id: "user", policy: "DENY", expires_at: NOW - 1 }], NOW);
    assert.equal(result.action, "REQUIRE_VERIFICATION");
});

test("account-age bypass is disabled by default", () => {
    assert.equal(TrustPolicyService.evaluate(member(), { trusted_account_age_days: 90 }, [], NOW).action, "REQUIRE_VERIFICATION");
});

test("enabled account-age rule bypasses sufficiently old accounts", () => {
    const result = TrustPolicyService.evaluate(member(), { automatic_trusted_verification: 1, trusted_account_age_days: 90 }, [], NOW);
    assert.equal(result.action, "BYPASS");
    assert.equal(result.source, "ACCOUNT_AGE");
});
