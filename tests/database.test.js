const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("../src/database/Database");

async function temporaryDatabase(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gatekeeper-db-"));
    const database = new Database({
        path: path.join(directory, "verification.sqlite"),
        url: "",
        logRetentionDays: 90
    });
    await database.initialize();
    t.after(async () => {
        await database.close();
        fs.rmSync(directory, { recursive: true, force: true });
    });
    return database;
}

test("persists guild settings across a restart", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gatekeeper-restart-"));
    const databasePath = path.join(directory, "verification.sqlite");
    const options = { path: databasePath, url: "", logRetentionDays: 90 };
    const first = new Database(options);
    await first.initialize();
    await first.guilds.saveSettings({ guildId: "guild-1", verifyChannelId: "channel-1", verifiedRoleId: "role-1" });
    await first.close();

    const second = new Database(options);
    await second.initialize();
    const settings = await second.guilds.getSettings("guild-1");
    assert.equal(settings.verify_channel_id, "channel-1");
    assert.equal(settings.verified_role_id, "role-1");
    await second.close();
    fs.rmSync(directory, { recursive: true, force: true });
    t.assert.ok(true);
});

test("cleans expired challenges, sessions, and old logs", async t => {
    const database = await temporaryDatabase(t);
    const now = Date.now();
    await database.captchas.create({ userId: "user-1", guildId: "guild-1", captchaId: "old", hash: "hash", salt: "salt", maxAttempts: 3, createdAt: now - 1000, expiresAt: now - 1 });
    await database.run("INSERT INTO dashboard_sessions (session_id, session_data, expires_at) VALUES (?, ?, ?)", ["old-session", "{}", now - 1]);
    await database.logs.record({ guildId: "guild-1", userId: "user-1", success: true, timestamp: Math.floor(now / 1000) - 100 * 86400 });
    await database.trustPolicies.upsert({ guildId: "guild-1", subjectType: "USER", subjectId: "expired-user", policy: "TRUST", expiresAt: now - 1 });
    await database.cleanup();
    assert.equal((await database.captchas.getAll()).length, 0);
    assert.equal(await database.get("SELECT 1 FROM dashboard_sessions WHERE session_id = ?", ["old-session"]), undefined);
    assert.equal(await database.logs.getTotalAttempts("guild-1"), 0);
    assert.equal((await database.trustPolicies.listForGuild("guild-1")).length, 0);
});

test("reports database health", async t => {
    const database = await temporaryDatabase(t);
    assert.deepEqual(await database.health(), { connected: true, engine: "sqlite" });
});

test("persists high-alert state and security audit events", async t => {
    const database = await temporaryDatabase(t);
    await database.guilds.saveSettings({ guildId: "guild-raid", verifyChannelId: "channel", verifiedRoleId: "role" });
    await database.guilds.setHighAlertUntil("guild-raid", 123456789);
    await database.securityEvents.record({ guildId: "guild-raid", type: "JOIN_VELOCITY_ALERT", details: "10 joins", timestamp: 1000 });
    const settings = await database.guilds.getSettings("guild-raid");
    const events = await database.securityEvents.recent("guild-raid");
    assert.equal(settings.high_alert_until, 123456789);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "JOIN_VELOCITY_ALERT");
});

test("creates, replaces, expires, and removes trust policies", async t => {
    const database = await temporaryDatabase(t);
    await database.trustPolicies.upsert({ guildId: "guild", subjectType: "USER", subjectId: "user", policy: "TRUST", reason: "member", createdBy: "admin" });
    await database.trustPolicies.upsert({ guildId: "guild", subjectType: "USER", subjectId: "user", policy: "DENY", expiresAt: 123, createdBy: "admin" });
    const policies = await database.trustPolicies.listForGuild("guild");
    assert.equal(policies.length, 1);
    assert.equal(policies[0].policy, "DENY");
    assert.equal(policies[0].expires_at, 123);
    await database.trustPolicies.remove("guild", "USER", "user");
    assert.equal((await database.trustPolicies.listForGuild("guild")).length, 0);
});

test("records report delivery success and failure history", async t => {
    const database = await temporaryDatabase(t);
    await database.reportDeliveries.record({ guildId: "guild", deliveryType: "SCHEDULED_REPORT", period: "WEEKLY", channelId: "channel", success: true, attempts: 1, timestamp: 1000 });
    await database.reportDeliveries.record({ guildId: "guild", deliveryType: "ALERT_CRITICAL", channelId: "channel", success: false, attempts: 3, error: "Missing permission", timestamp: 2000 });
    const history = await database.reportDeliveries.recent("guild");
    assert.equal(history.length, 2);
    assert.equal(history[0].success, 0);
    assert.equal(history[0].attempts, 3);
    assert.equal(history[0].error, "Missing permission");
});

test("persists and replaces member verification versions", async t => {
    const database = await temporaryDatabase(t);
    await database.verificationRecords.upsert({ guildId: "guild", userId: "user", verifiedAt: 1000, policyVersion: 1, method: "CAPTCHA" });
    await database.verificationRecords.upsert({ guildId: "guild", userId: "user", verifiedAt: 2000, policyVersion: 2, method: "MANUAL" });
    const record = await database.verificationRecords.find("guild", "user");
    assert.equal(record.verified_at, 2000);
    assert.equal(record.policy_version, 2);
    assert.equal(record.method, "MANUAL");
    await database.verificationRecords.remove("guild", "user");
    assert.equal(await database.verificationRecords.find("guild", "user"), null);
});

test("queues, reminds, enforces, and removes pending reverification", async t => {
    const database = await temporaryDatabase(t);
    await database.reverifications.upsert({ guildId: "guild", userId: "user", detectedAt: 1000, dueAt: 2000, reason: "POLICY_UPDATED" });
    await database.reverifications.markReminded("guild", "user", 1500);
    let item = await database.reverifications.find("guild", "user");
    assert.equal(item.status, "PENDING");
    assert.equal(item.reminder_count, 1);
    await database.reverifications.markCancelled("guild", "user");
    item = await database.reverifications.find("guild", "user");
    assert.equal(item.status, "CANCELLED");
    await database.reverifications.upsert({ guildId: "guild", userId: "user", detectedAt: 1000, dueAt: 2000, reason: "POLICY_UPDATED" });
    await database.reverifications.markEnforced("guild", "user", 2500);
    item = await database.reverifications.find("guild", "user");
    assert.equal(item.status, "ENFORCED");
    assert.equal(item.enforced_at, 2500);
    await database.reverifications.remove("guild", "user");
    assert.equal(await database.reverifications.find("guild", "user"), null);
});

test("tracks setup completion and configuration health", async t => {
    const database = await temporaryDatabase(t);
    await database.guilds.saveSettings({ guildId: "guild-health", verifyChannelId: "channel", verifiedRoleId: "role" });
    await database.guilds.markSetupComplete("guild-health", "admin", 1000);
    await database.guilds.updateHealth("guild-health", 85, 2000);
    await database.guilds.setLastHealthAlertAt("guild-health", 3000);
    const settings = await database.guilds.getSettings("guild-health");
    assert.equal(settings.setup_completed_at, 1000);
    assert.equal(settings.setup_completed_by, "admin");
    assert.equal(settings.last_health_score, 85);
    assert.equal(settings.last_health_checked_at, 2000);
    assert.equal(settings.last_health_alert_at, 3000);
});
