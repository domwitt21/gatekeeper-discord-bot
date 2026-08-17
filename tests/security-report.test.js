const test = require("node:test");
const assert = require("node:assert/strict");
const SecurityReportService = require("../src/services/SecurityReportService");

function clientFixture() {
    const deliveries = [];
    const sent = [];
    const client = { database: {
        get: async () => ({ total: 10, successes: 8, failures: 2 }),
        all: async () => [{ type: "JOIN_VELOCITY_ALERT" }, { type: "TRUST_POLICY_DENY" }, { type: "MANUAL_VERIFY" }],
        reportDeliveries: { record: async entry => deliveries.push(entry) },
        guilds: { setLastReportAt: async () => {}, getAllSettings: async () => [] }
    }, guilds: { cache: new Map() } };
    const guild = { id: "guild", channels: { fetch: async () => ({ isTextBased: () => true, send: async message => sent.push(message) }) } };
    return { client, guild, deliveries, sent };
}

test("report generation summarizes verification and security activity", async () => {
    const value = clientFixture();
    const report = await new SecurityReportService(value.client).generate("guild", "WEEKLY", Date.UTC(2026, 0, 8));
    assert.equal(report.total, 10);
    assert.equal(report.successRate, 80);
    assert.equal(report.raidAlerts, 1);
    assert.equal(report.denials, 1);
    assert.equal(report.manualActions, 1);
});

test("scheduled reports are off by default and respect schedule and quiet hours", () => {
    const service = new SecurityReportService(clientFixture().client);
    const mondayNoon = new Date(Date.UTC(2026, 0, 5, 12));
    assert.equal(service.isDue({}, mondayNoon), false);
    const enabled = { scheduled_reports_enabled: 1, report_frequency: "WEEKLY", report_weekday: 1, report_hour_utc: 12, last_report_at: 0 };
    assert.equal(service.isDue(enabled, mondayNoon), true);
    assert.equal(service.isDue({ ...enabled, quiet_hours_start_utc: 11, quiet_hours_end_utc: 13 }, mondayNoon), false);
});

test("successful channel delivery records history", async () => {
    const value = clientFixture();
    const service = new SecurityReportService(value.client);
    await service.deliver(value.guild, { report_channel_id: "channel" }, "DAILY", "ON_DEMAND_REPORT");
    assert.equal(value.sent.length, 1);
    assert.equal(value.deliveries[0].success, true);
    assert.equal(value.deliveries[0].attempts, 1);
});

test("severity filtering and quiet hours suppress noncritical alerts", () => {
    const service = new SecurityReportService(clientFixture().client);
    assert.equal(service.severityAllowed({ minimum_alert_severity: "CRITICAL" }, "WARNING"), false);
    assert.equal(service.inQuietHours({ quiet_hours_start_utc: 22, quiet_hours_end_utc: 6 }, new Date(Date.UTC(2026, 0, 1, 23))), true);
});
