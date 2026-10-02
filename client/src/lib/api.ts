import { validateRSVP, type RSVP, type Stats } from "./rsvp";

const apiUrl = (import.meta.env.VITE_RSVP_API_URL ?? "").replace(/\/$/, "");
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const guestStorageKey = "maryam-mehran-party:2026:v2:guest";
let guestToken: string | null = null;
let pendingSession: Promise<string> | null = null;

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl || !publishableKey || apiUrl.includes("YOUR_PROJECT_REF")) {
    throw new Error("اتصال فرم هنوز آماده نیست؛ لطفاً کمی بعد دوباره امتحان کن.");
  }
  const response = await fetch(`${apiUrl}/${path}`, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(20000),
    headers: { apikey: publishableKey, ...init.headers },
  }).catch(() => { throw new Error("اتصال برقرار نشد؛ جواب‌ها رو نگه داشتیم، دوباره امتحان کن ❤️"); });
  const data = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok || !data) throw new ApiError(data?.error ?? "جوابت ثبت نشد؛ دوباره امتحان کن.", response.status);
  return data;
}

export function ensureGuestSession(): Promise<string> {
  if (guestToken) return Promise.resolve(guestToken);
  try { guestToken = localStorage.getItem(guestStorageKey); } catch { /* In-memory session still works. */ }
  if (guestToken) return Promise.resolve(guestToken);
  if (!pendingSession) {
    pendingSession = call<{ guestToken: string }>("session").then(data => {
      if (!data.guestToken) throw new Error("اتصال به فرم برقرار نشد؛ دوباره امتحان کن.");
      guestToken = data.guestToken;
      try { localStorage.setItem(guestStorageKey, guestToken); } catch {}
      return guestToken;
    }).finally(() => { pendingSession = null; });
  }
  return pendingSession;
}

export async function saveRSVP(raw: unknown): Promise<RSVP> {
  const value = validateRSVP(raw);
  const token = await ensureGuestSession();
  try {
    const data = await call<{ saved: boolean; value: RSVP }>("rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...value, guestToken: token }),
    });
    if (data.saved !== true) throw new Error("جوابت ثبت نشد؛ دوباره امتحان کن.");
    return validateRSVP(data.value);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // The old capability may have expired or been revoked. Preserve form inputs;
      // let the guest explicitly retry with a fresh session.
      guestToken = null;
      try { localStorage.removeItem(guestStorageKey); } catch {}
    }
    throw error;
  }
}

export const getStats = (adminToken: string) => call<Stats>("stats", { headers: { "X-Party-Admin": adminToken } });
