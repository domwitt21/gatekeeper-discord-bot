const test = require("node:test");
const assert = require("node:assert/strict");
const ReverificationService = require("../src/services/ReverificationService");

function fixture() {
    const removedRoles = [];
    const events = [];
    const state = { removedRecord: false, enforced: false, reminded: false };
    const roleCache = new Map([["verified", {}]]);
    const member = { id: "user", user: { createdTimestamp: 0 }, guild: null,
        roles: { cache: roleCache, remove: async role => { removedRoles.push(role.id); roleCache.delete(role.id); } },
        send: async () => {} };
    const guild = { id: "guild", name: "Example", members: { fetch: async () => member },
        roles: { cache: new Map([["verified", { id: "verified" }]]) },
        channels: { fetch: async () => null } };
    member.guild = guild;
    const client = { guilds: { cache: new Map([["guild", guild]]) }, database: {
        trustPolicies: { listForGuild: async () => [] },
        verificationRecords: { listReverificationCandidates: async () => [], remove: async () => { state.removedRecord = true; } },
        reverifications: { remove: async () => {}, markReminded: async () => { state.reminded = true; },
            markEnforced: async () => { state.enforced = true; }, upsert: async () => {}, listForGuild: async () => [] },
        securityEvents: { record: async event => events.push(event) },
        guilds: { getAllSettings: async () => [] }
    } };
    return { client, guild, member, state, events, removedRoles };
}

test("reverification remains preview-only until enforcement is enabled", async () => {
    const value = fixture();
    const service = new ReverificationService(value.client);
    value.client.database.guilds.getAllSettings = async () => [{ guild_id: "guild", verified_role_id: "verified",
        reverification_enforcement_enabled: 0 }];
    value.client.database.reverifications.listForGuild = async () => { throw new Error("must not process queue"); };
    await service.tick(1000);
    assert.deepEqual(value.removedRoles, []);
});

test("expired grace period removes role and verification record", async () => {
    const value = fixture();
    const service = new ReverificationService(value.client);
    await service.processItem({ guild_id: "guild", user_id: "user", due_at: 1000,
        last_reminded_at: 2000, reminder_count: 1, reason: "POLICY_UPDATED" },
    { verified_role_id: "verified", reverification_notify_dm: 0 }, 3000);
    assert.deepEqual(value.removedRoles, ["verified"]);
    assert.equal(value.state.removedRecord, true);
    assert.equal(value.state.enforced, true);
    assert.equal(value.events.at(-1).type, "REVERIFICATION_ENFORCED");
});

test("trusted members are exempt from pending enforcement", async () => {
    const value = fixture();
    let removed = false;
    value.client.database.trustPolicies.listForGuild = async () => [{ subject_type: "USER", subject_id: "user", policy: "TRUST", expires_at: 0 }];
    value.client.database.reverifications.remove = async () => { removed = true; };
    const result = await new ReverificationService(value.client).processItem({ guild_id: "guild", user_id: "user", due_at: 1,
        reason: "POLICY_UPDATED" }, { verified_role_id: "verified" }, 3000);
    assert.equal(result.exempt, true);
    assert.equal(removed, true);
    assert.deepEqual(value.removedRoles, []);
});
