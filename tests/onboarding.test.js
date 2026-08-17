const test = require("node:test");
const assert = require("node:assert/strict");
const OnboardingService = require("../src/services/OnboardingService");

function fixture(settings = {}) {
    const deliveries = [];
    const events = [];
    const messages = [];
    const roles = new Map();
    const member = { id: "user", guild: null, roles: { cache: roles, add: async role => roles.set(role.id, role) },
        send: async payload => messages.push({ destination: "DM", payload }), toString: () => "<@user>" };
    const guild = { id: "guild", name: "Community", roles: { cache: new Map([["member", { id: "member" }]]) },
        members: { fetch: async () => member }, channels: { fetch: async () => ({ isTextBased: () => true,
            send: async payload => messages.push({ destination: "CHANNEL", payload }) }) } };
    member.guild = guild;
    const configured = { onboarding_enabled: 1, onboarding_delivery_mode: "DM", onboarding_welcome_message: "Welcome {user} to {server}",
        onboarding_include_trusted: 1, onboarding_include_manual: 1, ...settings };
    const client = { guilds: { cache: new Map([["guild", guild]]) }, database: {
        guilds: { getSettings: async () => configured }, securityEvents: { record: async event => events.push(event) },
        onboardingDeliveries: { create: async entry => { deliveries.push(entry); return "delivery"; },
            latestAwaiting: async () => ({ delivery_id: "delivery" }), acknowledge: async (...args) => deliveries.push({ acknowledged: args }),
            dueFollowups: async () => [], markFollowup: async () => {} }
    } };
    return { client, guild, member, configured, deliveries, events, messages, roles };
}

test("onboarding is disabled by default", async () => {
    const value = fixture({ onboarding_enabled: 0 });
    assert.deepEqual(await new OnboardingService(value.client).deliver(value.member), { skipped: true });
    assert.equal(value.messages.length, 0);
});

test("onboarding can deliver to DM and channel with placeholders", async () => {
    const value = fixture({ onboarding_delivery_mode: "BOTH" });
    const result = await new OnboardingService(value.client).deliver(value.member, "CAPTCHA");
    assert.equal(result.status, "DELIVERED");
    assert.deepEqual(result.delivered, ["DM", "CHANNEL"]);
    assert.equal(value.messages[0].payload.embeds[0].data.description, "Welcome <@user> to Community");
    assert.equal(value.deliveries[0].triggerType, "CAPTCHA");
});

test("trusted and manual onboarding controls are respected", async () => {
    const value = fixture({ onboarding_include_trusted: 0, onboarding_include_manual: 0 });
    const service = new OnboardingService(value.client);
    assert.equal((await service.deliver(value.member, "TRUST_USER")).skipped, true);
    assert.equal((await service.deliver(value.member, "MANUAL")).skipped, true);
});

test("acknowledgment grants the optional role and schedules follow-up", async () => {
    const value = fixture({ onboarding_require_acknowledgement: 1, onboarding_secondary_role_id: "member",
        onboarding_followup_enabled: 1, onboarding_followup_delay_minutes: 5 });
    let reply;
    await new OnboardingService(value.client).acknowledge({ guild: null, customId: "onboarding_ack:guild", user: { id: "user" },
        reply: async payload => { reply = payload; } });
    assert.equal(value.roles.has("member"), true);
    assert.equal(value.deliveries[0].acknowledged[0], "delivery");
    assert.match(reply.content, /acknowledged/i);
});

test("safe test validates configuration without sending", async () => {
    const value = fixture({ onboarding_delivery_mode: "CHANNEL", onboarding_channel_id: "channel" });
    const result = await new OnboardingService(value.client).test(value.guild, value.configured);
    assert.equal(result.passed, true);
    assert.equal(value.messages.length, 0);
});
