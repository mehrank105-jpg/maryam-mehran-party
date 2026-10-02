import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, sha256, type Environment } from "../supabase/functions/party-rsvp/handler.ts";

const origin = "https://mehrank105-jpg.github.io";
const adminToken = "a".repeat(64); // Test fixture, never a production credential.
const secret = "test-guest-signing-secret-which-is-not-production";
const serverKey = "sb_secret_test_fixture";
const url = "https://project.invalid/functions/v1/party-rsvp/";

async function fixture() {
  const rows = new Map<string, Record<string, unknown>>();
  let databaseCalls = 0;
  let failWrite = false;
  let acknowledgeWrite = true;
  const env: Environment = { supabaseUrl: "https://project.invalid", serverKey, guestSigningSecret: secret, adminTokenHash: await sha256(adminToken), allowedOrigins: [origin] };
  const fetcher: typeof fetch = async (input, init) => {
    databaseCalls++;
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("apikey"), serverKey);
    assert.equal(headers.get("authorization"), null, "opaque Supabase keys must not be sent as JWTs");
    if (init?.method === "POST") {
      if (failWrite) return Response.json({ error: "private-upstream-error" }, { status: 500 });
      const row = JSON.parse(init.body as string);
      rows.set(row.guest_id, row);
      return Response.json(acknowledgeWrite ? [row] : []);
    }
    const query = new URL(input as string);
    const offset = Number(query.searchParams.get("offset"));
    return Response.json([...rows.values()].slice(offset, offset + 1000));
  };
  let now = Date.parse("2026-10-02T12:00:00Z");
  const handler = createHandler(env, fetcher, () => now);
  const request = (path: string, init: RequestInit = {}) => handler(new Request(url + path, { ...init, headers: { Origin: origin, ...init.headers } }));
  const session = async () => (await (await request("session")).json()).guestToken as string;
  const save = (guestToken: string, data: Record<string, unknown>) => request("rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, guestToken }) });
  return { env, handler, request, session, save, rows, calls: () => databaseCalls, setFailure: (fail: boolean) => { failWrite = fail; }, setAcknowledgment: (value: boolean) => { acknowledgeWrite = value; }, advance: (seconds: number) => { now += seconds * 1000; } };
}

test("same-browser correction updates one central row and removes stale meal/drink on no", async () => {
  const f = await fixture();
  const token = await f.session();
  const first = await f.save(token, { name: "مهمان اول", attending: true, meal: "joojeh", drink: "non_alcoholic" });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).saved, true);
  const second = await f.save(token, { name: "مهمان اول", attending: false, meal: "joojeh", drink: "alcoholic", guest_id: "attacker-controlled-id" });
  assert.equal(second.status, 200);
  assert.equal(f.rows.size, 1);
  const row = [...f.rows.values()][0];
  assert.equal(row.attending, false);
  assert.equal(row.meal, null);
  assert.equal(row.drink, null);
  assert.notEqual(row.guest_id, "attacker-controlled-id");
});

test("unauthorized visitors and guest capabilities cannot read statistics", async () => {
  const f = await fixture();
  const token = await f.session();
  for (const value of ["", token, "b".repeat(64), serverKey]) {
    const response = await f.request("stats", { headers: { "X-Party-Admin": value } });
    assert.equal(response.status, 401);
    assert.equal(f.calls(), 0);
    assert.equal((await response.text()).includes(serverKey), false);
  }
});

test("host statistics combine independent guests and count only yes meals/drinks", async () => {
  const f = await fixture();
  await f.save(await f.session(), { name: "دوست یک", attending: true, meal: "joojeh", drink: "alcoholic" });
  await f.save(await f.session(), { name: "دوست دو", attending: true, meal: "koobideh", drink: "non_alcoholic" });
  await f.save(await f.session(), { name: "دوست سه", attending: false });
  const response = await f.request("stats", { headers: { "X-Party-Admin": adminToken } });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual({ ...data, guests: undefined }, { total: 3, yes: 2, no: 1, joojeh: 1, koobideh: 1, alcoholic: 1, non_alcoholic: 1, guests: undefined });
  assert.equal(data.guests.length, 3);
  assert.equal(JSON.stringify(data).includes("guest_id"), false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("forged and expired guest identities are rejected before database access", async () => {
  const f = await fixture();
  const token = await f.session();
  const parts = token.split(".");
  parts[1] = crypto.randomUUID();
  const payload = { name: "دوست", attending: false };
  assert.equal((await f.save(parts.join("."), payload)).status, 401);
  f.advance(181 * 86400);
  assert.equal((await f.save(token, payload)).status, 401);
  assert.equal(f.calls(), 0);
});

test("database failure or missing write acknowledgment never confirms saved", async () => {
  const f = await fixture();
  const token = await f.session();
  f.setFailure(true);
  const failed = await f.save(token, { name: "دوست", attending: false });
  assert.equal(failed.status, 503);
  const data = await failed.json();
  assert.notEqual(data.saved, true);
  assert.equal(JSON.stringify(data).includes("private-upstream-error"), false);
  f.setFailure(false); f.setAcknowledgment(false);
  assert.equal((await f.save(token, { name: "دوست", attending: false })).status, 503);
});

test("invalid attending choices and oversized requests are not stored", async () => {
  const f = await fixture();
  const token = await f.session();
  assert.equal((await f.save(token, { name: "دوست", attending: true, meal: "other", drink: "alcoholic" })).status, 400);
  assert.equal((await f.save(token, { name: "x".repeat(5000), attending: false })).status, 413);
  assert.equal(f.calls(), 0);
});

test("CORS permits the invitation origin and rejects unrelated origins", async () => {
  const f = await fixture();
  const preflight = await f.request("rsvp", { method: "OPTIONS" });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  const forbidden = await f.handler(new Request(url + "session", { headers: { Origin: "https://unrelated.invalid" } }));
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get("Access-Control-Allow-Origin"), null);
});
