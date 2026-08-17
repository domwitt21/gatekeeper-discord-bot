const test = require("node:test");
const assert = require("node:assert/strict");
const ModerationService = require("../src/services/ModerationService");

function fixture(options = {}) {
    const roles = new Map(options.verified ? [["verified", {}]] : []);
    const events = [];
    const removed = [];
    const added = [];
    const member = { id: "user", user: { createdTimestamp: Date.now() }, guild: { id: "guild" }, roles: { cache: roles,
        add: async id => { added.push(id); roles.set(id, {}); },
        remove: async id => { removed.push(id); roles.delete(id); } } };
    member.guild.members = { fetch: async () => member };
    const client = { database: {
        guilds: { getSettings: async () => ({ verified_role_id: "verified", remove_verified_role_on_deny: options.autoRemove ? 1 : 0 }) },
        captchas: { findActive: async () => options.challenge ? {} : null, deleteActive: async () => {} },
        securityEvents: { record: async event => events.push(event) },
        trustPolicies: { listForGuild: async () => [] }
    }, verificationManager: options.manager };
    return { client, member, events, removed, added };
}

test("manual verification adds the role and records an audit event", async () => {
    const value = fixture();
    await ModerationService.verify(value.client, value.member, "admin", "approved");
    assert.deepEqual(value.added, ["verified"]);
    assert.equal(value.events[0].type, "MANUAL_VERIFY");
});

test("manual unverify removes the role and records an audit event", async () => {
    const value = fixture({ verified: true });
    const result = await ModerationService.unverify(value.client, value.member, "admin", "reviewed");
    assert.equal(result.changed, true);
    assert.deepEqual(value.removed, ["verified"]);
    assert.equal(value.events[0].type, "MANUAL_UNVERIFY");
});

test("reset clears persistent and runtime state", async () => {
    let persistentReset = false;
    let runtimeReset = false;
    const value = fixture({ manager: { resetMemberState: () => { runtimeReset = true; } } });
    value.client.database.captchas.deleteActive = async () => { persistentReset = true; };
    await ModerationService.reset(value.client, value.member, "admin");
    assert.equal(persistentReset, true);
    assert.equal(runtimeReset, true);
});

test("deny role removal remains disabled by default", async () => {
    const value = fixture({ verified: true });
    assert.equal(await ModerationService.revokeIfDenied(value.client, value.member.guild, "user", "admin"), false);
    assert.deepEqual(value.removed, []);
});

test("enabled deny role removal revokes verification", async () => {
    const value = fixture({ verified: true, autoRemove: true });
    assert.equal(await ModerationService.revokeIfDenied(value.client, value.member.guild, "user", "admin"), true);
    assert.deepEqual(value.removed, ["verified"]);
    assert.equal(value.events[0].type, "DENY_AUTO_UNVERIFY");
});
