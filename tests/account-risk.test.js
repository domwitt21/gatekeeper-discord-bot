const test = require("node:test");
const assert = require("node:assert/strict");
const AccountRiskService = require("../src/services/AccountRiskService");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 0, 31);

test("account-age screening is disabled at zero days", () => {
    assert.equal(AccountRiskService.evaluate({ createdTimestamp: NOW }, { minimum_account_age_days: 0 }, NOW).suspicious, false);
});

test("an account exactly at the minimum age is accepted", () => {
    const result = AccountRiskService.evaluate({ createdTimestamp: NOW - 7 * DAY }, { minimum_account_age_days: 7 }, NOW);
    assert.equal(result.suspicious, false);
    assert.equal(result.ageDays, 7);
});

test("a newer account is blocked by default", () => {
    const result = AccountRiskService.evaluate({ createdTimestamp: NOW - 2 * DAY }, { minimum_account_age_days: 7 }, NOW);
    assert.equal(result.suspicious, true);
    assert.equal(result.action, "BLOCK");
});

test("log-only mode preserves the configured action", () => {
    const result = AccountRiskService.evaluate({ createdTimestamp: NOW - DAY }, { minimum_account_age_days: 30, suspicious_account_action: "LOG_ONLY" }, NOW);
    assert.equal(result.suspicious, true);
    assert.equal(result.action, "LOG_ONLY");
});

test("invalid settings safely disable screening", () => {
    assert.equal(AccountRiskService.evaluate({ createdTimestamp: NOW }, { minimum_account_age_days: "nope" }, NOW).minimumDays, 0);
});
