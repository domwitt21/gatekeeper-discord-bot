const test = require("node:test");
const assert = require("node:assert/strict");
const ConfigurationHealthService = require("../src/services/ConfigurationHealthService");

function fixture(options = {}) {
    const allowed = options.allowed !== false;
    const channel = { id: "verify", isTextBased: () => true, permissionsFor: () => ({ has: () => allowed }) };
    const role = { id: "verified", managed: false, position: options.rolePosition || 2 };
    const bot = { permissions: { has: () => allowed }, roles: { highest: { position: options.botPosition || 10 } } };
    const guild = { id: "guild", memberCount: options.memberCount || 100, members: { me: bot, fetchMe: async () => bot },
        channels: { fetch: async id => id === "verify" || id === "log" ? channel : null },
        roles: { fetch: async id => id === "verified" ? role : null } };
    const events = [];
    const healthUpdates = [];
    const client = { guilds: { cache: new Map([["guild", guild]]) }, database: {
        guilds: { getAllSettings: async () => [], updateHealth: async (...args) => healthUpdates.push(args), setLastHealthAlertAt: async () => {} },
        securityEvents: { record: async event => events.push(event) }
    } };
    return { client, guild, events, healthUpdates };
}

test("healthy configuration passes every required check", async () => {
    const value = fixture();
    const result = await new ConfigurationHealthService(value.client).validate(value.guild, {
        verify_channel_id: "verify", verified_role_id: "verified", log_channel_id: "log", verification_enabled: 1
    });
    assert.equal(result.score, 100);
    assert.equal(result.status, "HEALTHY");
    assert.equal(result.issues.length, 0);
});

test("permission and hierarchy failures block configuration", async () => {
    const value = fixture({ allowed: false, botPosition: 1, rolePosition: 5 });
    const result = await new ConfigurationHealthService(value.client).validate(value.guild, {
        verify_channel_id: "verify", verified_role_id: "verified", verification_enabled: 1
    });
    assert.equal(result.status, "BLOCKED");
    assert.ok(result.issues.some(issue => issue.key === "manage_roles"));
    assert.ok(result.issues.some(issue => issue.key === "role_hierarchy"));
});

test("safe test never changes member state", async () => {
    const value = fixture();
    const result = await new ConfigurationHealthService(value.client).test(value.guild, {
        verify_channel_id: "verify", verified_role_id: "verified", verification_enabled: 1
    });
    assert.equal(result.passed, true);
    assert.match(result.message, /No roles were assigned/);
});

test("regression inspection records a health warning", async () => {
    const value = fixture({ allowed: false });
    await new ConfigurationHealthService(value.client).inspectGuild(value.guild, {
        verify_channel_id: "verify", verified_role_id: "verified", verification_enabled: 1,
        last_health_score: 100, last_health_alert_at: 0
    }, 200000000);
    assert.equal(value.healthUpdates.length, 1);
    assert.equal(value.events[0].type, "CONFIGURATION_HEALTH_WARNING");
});

test("preset recommendation scales with server risk", () => {
    const small = fixture({ memberCount: 10 });
    const large = fixture({ memberCount: 2000 });
    const service = new ConfigurationHealthService(small.client);
    assert.equal(service.recommendedPreset(small.guild, {}), "BASIC");
    assert.equal(service.recommendedPreset(large.guild, {}), "STRICT");
    assert.equal(service.recommendedPreset(small.guild, { raid_protection_enabled: 1 }), "STRICT");
});
