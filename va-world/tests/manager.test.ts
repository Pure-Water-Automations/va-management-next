import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../server/src/env";
import { fetchVaProfile, type VaProfile } from "../server/src/manager";

// config holds plain runtime values; cast away readonly to drive each scenario.
const writable = config as { managerBaseUrl: string; externalAppSecret: string };

function setConfigured() {
  writable.managerBaseUrl = "https://manager.test";
  writable.externalAppSecret = "secret-123";
}
function setUnconfigured() {
  writable.managerBaseUrl = "";
  writable.externalAppSecret = "";
}

const sampleProfile: VaProfile = {
  vaId: "VA-9",
  name: "Sam",
  email: "sam@x.com",
  tier: "TIER_1",
  status: "active",
  supervisorVaId: null,
  skillSpecs: null,
  availabilityNotes: null,
  notionProfileUrl: "https://notion.so/sam",
  roleStartedDate: null,
};

test("returns null (without calling fetch) when the bridge isn't configured", async () => {
  setUnconfigured();
  let called = false;
  const spy = (async () => {
    called = true;
    return { ok: true, json: async () => sampleProfile };
  }) as unknown as typeof fetch;
  assert.equal(await fetchVaProfile("sam@x.com", spy), null);
  assert.equal(called, false);
});

test("sends bearer auth + email and returns the profile on 200", async () => {
  setConfigured();
  let seenUrl = "";
  let seenAuth: string | undefined;
  const spy = (async (url: string, init: RequestInit) => {
    seenUrl = url;
    seenAuth = (init.headers as Record<string, string>).authorization;
    return { ok: true, json: async () => sampleProfile };
  }) as unknown as typeof fetch;

  const profile = await fetchVaProfile("sam@x.com", spy);
  assert.deepEqual(profile, sampleProfile);
  assert.equal(seenUrl, "https://manager.test/api/external/va-profile?email=sam%40x.com");
  assert.equal(seenAuth, "Bearer secret-123");
});

test("returns null on a non-2xx response (401/404)", async () => {
  setConfigured();
  const spy = (async () => ({ ok: false, json: async () => ({ ok: false }) })) as unknown as typeof fetch;
  assert.equal(await fetchVaProfile("nope@x.com", spy), null);
});

test("returns null when fetch throws (network error)", async () => {
  setConfigured();
  const spy = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  assert.equal(await fetchVaProfile("sam@x.com", spy), null);
});
