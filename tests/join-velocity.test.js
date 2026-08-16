const test = require("node:test");
const assert = require("node:assert/strict");
const JoinVelocityService = require("../src/services/JoinVelocityService");

const settings = { raid_protection_enabled: 1, join_velocity_threshold: 3,
    join_velocity_window_seconds: 60, high_alert_minutes: 10, high_alert_until: 0 };

test("join monitoring is disabled by default", () => {
    assert.equal(new JoinVelocityService().recordJoin("guild", {}, 1000).enabled, false);
});

test("join threshold activates high-alert mode", () => {
    const service = new JoinVelocityService();
    assert.equal(service.recordJoin("guild", settings, 1000).triggered, false);
    assert.equal(service.recordJoin("guild", settings, 2000).triggered, false);
    const result = service.recordJoin("guild", settings, 3000);
    assert.equal(result.triggered, true);
    assert.equal(result.active, true);
    assert.equal(result.highAlertUntil, 603000);
});

test("joins outside the configured window are discarded", () => {
    const service = new JoinVelocityService();
    service.recordJoin("guild", settings, 1000);
    service.recordJoin("guild", settings, 2000);
    assert.equal(service.recordJoin("guild", settings, 61001).count, 2);
});

test("an existing high-alert period is not retriggered", () => {
    const service = new JoinVelocityService();
    const active = { ...settings, high_alert_until: 999999 };
    service.recordJoin("guild", active, 1000);
    service.recordJoin("guild", active, 2000);
    const result = service.recordJoin("guild", active, 3000);
    assert.equal(result.triggered, false);
    assert.equal(result.active, true);
});
