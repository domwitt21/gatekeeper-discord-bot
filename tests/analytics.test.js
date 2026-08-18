const test = require("node:test");
const assert = require("node:assert/strict");
const AnalyticsService = require("../src/services/AnalyticsService");
const SecurityExportService = require("../src/services/SecurityExportService");

function fixture() {
    const client = { database: {
        get: async sql => sql.includes("onboarding_deliveries") ? { total: 5, failures: 1, acknowledged: 3 }
            : { total: 10, successes: 8, failures: 2, average_duration: 42.5, average_attempts: 1.25 },
        all: async sql => {
            if (sql.includes("GROUP BY day")) return [{ day: "2026-08-01", successes: 8, failures: 2 }];
            if (sql.includes("GROUP BY failure_reason")) return [{ reason: "Incorrect", count: 2 }];
            if (sql.includes("security_events")) return [{ type: "JOIN_VELOCITY_ALERT", timestamp: 1 }, { type: "MANUAL_VERIFY", timestamp: 2 }];
            if (sql.includes("SELECT user_id")) return [{ user_id: "123", success: 1, failure_reason: null, timestamp: 1000, attempts: 1, verification_duration: 20 }];
            return [];
        }
    } };
    return { client };
}

test("analytics calculates period metrics and comparisons", async () => {
    const report = await new AnalyticsService(fixture().client).generate("guild", { days: 30, now: Date.UTC(2026, 7, 15) });
    assert.equal(report.current.successRate, 80);
    assert.equal(report.current.averageDuration, 42.5);
    assert.equal(report.raidAlerts, 1);
    assert.equal(report.manual, 1);
    assert.equal(report.onboarding.acknowledged, 3);
});

test("CSV exports escape formulas and use privacy-safe identifiers", async () => {
    const service = new AnalyticsService(fixture().client);
    const rows = await service.exportRows("guild", service.range({ days: 30 }), true);
    assert.notEqual(rows[0].user, "123");
    assert.equal(rows[0].user.length, 12);
    const csv = new SecurityExportService().csv([{ ...rows[0], reason: '=HYPERLINK("bad")' }]);
    assert.match(csv, /"'=HYPERLINK\(""bad""\)"/);
});

test("branded PDF export produces a PDF document", async () => {
    const report = await new AnalyticsService(fixture().client).generate("guild", { days: 30 });
    const pdf = await new SecurityExportService().pdf({ name: "Example Server" }, report);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
});
