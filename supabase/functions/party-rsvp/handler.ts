import { validateRSVP, type RSVP, type Stats } from "./rsvp.ts";

export type Environment = {
  supabaseUrl: string;
  serverKey: string;
  guestSigningSecret: string;
  adminTokenHash: string;
  allowedOrigins: string[];
};
type Row = RSVP & { guest_id: string; updated_at: string };
type Fetch = typeof fetch;

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], s => parseInt(s, 16));
export const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const guestExpiryDays = 180;

function constantEqual(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    throw new HttpError(415, "فرمت جواب‌ها درست نیست؛ صفحه را دوباره باز کن.");
  }
  // Read a bounded stream, rather than trusting Content-Length from the caller.
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "جواب‌ها رو کامل کن 😄");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new HttpError(413, "حجم جواب‌ها بیش از حد مجاز است."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(merged));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch { throw new HttpError(400, "جواب‌ها درست دریافت نشد؛ دوباره امتحان کن."); }
}

export function createHandler(env: Environment, fetcher: Fetch = fetch, clock = () => Date.now()) {
  const ready = Boolean(env.supabaseUrl && env.serverKey && env.guestSigningSecret.length >= 32 && digest.test(env.adminTokenHash));
  let signingKey: Promise<CryptoKey> | null = null;
  function getSigningKey() {
    signingKey ??= crypto.subtle.importKey("raw", encoder.encode(env.guestSigningSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    return signingKey;
  }
  const restUrl = `${env.supabaseUrl.replace(/\/$/, "")}/rest/v1/party_rsvps_v2`;

  async function mintGuest() {
    const value = `v2.${crypto.randomUUID()}.${Math.floor(clock() / 1000) + guestExpiryDays * 86400}`;
    const signature = hex(await crypto.subtle.sign("HMAC", await getSigningKey(), encoder.encode(value)));
    return `${value}.${signature}`;
  }

  async function guestIdentity(value: unknown): Promise<string> {
    const invalid = () => new HttpError(401, "اتصال این فرم منقضی شده؛ دوباره دکمه ثبت را بزن.");
    if (typeof value !== "string" || value.length > 180) throw invalid();
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v2" || !uuid.test(parts[1]) || !/^\d{10}$/.test(parts[2]) || !digest.test(parts[3])) throw invalid();
    if (Number(parts[2]) <= Math.floor(clock() / 1000)) throw invalid();
    const valid = await crypto.subtle.verify("HMAC", await getSigningKey(), bytes(parts[3]), encoder.encode(parts.slice(0, 3).join(".")));
    if (!valid) throw invalid();
    return parts[1];
  }

  async function database(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = { apikey: env.serverKey };
    // New secret keys are opaque, not JWTs. Only the deprecated compatibility
    // fallback needs the historical Bearer header.
    if (!env.serverKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${env.serverKey}`;
    const response = await fetcher(`${restUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(12000),
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) throw new HttpError(503, "اتصال به محل ثبت جواب‌ها برقرار نشد؛ دوباره امتحان کن.");
    return response;
  }

  async function stats(): Promise<Stats> {
    const guests: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      const response = await database(`?select=guest_id,name,attending,meal,drink,updated_at&order=updated_at.desc,guest_id.asc&offset=${offset}&limit=1000`);
      const rows = await response.json() as Row[];
      if (!Array.isArray(rows)) throw new Error("Invalid database response");
      guests.push(...rows);
      if (rows.length < 1000) break;
    }
    const yes = guests.filter(row => row.attending);
    return {
      total: guests.length, yes: yes.length, no: guests.length - yes.length,
      joojeh: yes.filter(row => row.meal === "joojeh").length,
      koobideh: yes.filter(row => row.meal === "koobideh").length,
      alcoholic: yes.filter(row => row.drink === "alcoholic").length,
      non_alcoholic: yes.filter(row => row.drink === "non_alcoholic").length,
      guests: guests.map(row => ({ name: row.name, attending: Number(row.attending), meal: row.meal, drink: row.drink, updated_at: Math.floor(Date.parse(row.updated_at) / 1000) })),
    };
  }

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin") ?? "";
    const allowed = env.allowedOrigins.includes(origin);
    const headers: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin", "X-Content-Type-Options": "nosniff" };
    if (allowed) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "apikey, content-type, x-party-admin";
      headers["Access-Control-Max-Age"] = "600";
    }
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
    if (!allowed) return reply({ error: "این فرم را از لینک کارت دعوت باز کن." }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!ready) return reply({ error: "اتصال فرم هنوز آماده نیست؛ کمی بعد دوباره امتحان کن." }, 503);
    const path = new URL(request.url).pathname.replace(/\/$/, "").split("/").at(-1);
    try {
      if (path === "session" && request.method === "GET") return reply({ guestToken: await mintGuest() });
      if (path === "rsvp" && request.method === "POST") {
        const raw = await readJson(request);
        const guestId = await guestIdentity(raw.guestToken);
        let value: RSVP;
        try { value = validateRSVP(raw); } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : "جواب‌ها رو کامل کن 😄"); }
        const response = await database("?on_conflict=guest_id", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ ...value, guest_id: guestId, updated_at: new Date(clock()).toISOString() }),
        });
        const rows = await response.json() as Row[];
        if (rows.length !== 1 || rows[0].guest_id !== guestId) throw new Error("Write not acknowledged");
        const stored = validateRSVP(rows[0]);
        if (JSON.stringify(stored) !== JSON.stringify(value)) throw new Error("Write acknowledgment differs from submitted answer");
        return reply({ saved: true, value: stored });
      }
      if (path === "stats" && request.method === "GET") {
        const token = request.headers.get("X-Party-Admin") ?? "";
        if (!digest.test(token) || !constantEqual(await sha256(token), env.adminTokenHash)) {
          return reply({ error: "کد مدیریت درست نیست؛ آمار فقط برای میزبان‌هاست." }, 401);
        }
        return reply(await stats());
      }
      return reply({ error: "این آدرس پیدا نشد." }, 404);
    } catch (e) {
      if (e instanceof HttpError) return reply({ error: e.message }, e.status);
      // Do not return upstream errors, keys, names, or tokens to clients/logs.
      return reply({ error: "جواب‌ها درست ثبت یا دریافت نشد؛ دوباره امتحان کن." }, 503);
    }
  };
}
