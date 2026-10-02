import { useEffect, useState, type FormEvent } from "react";
import Dashboard from "./dashboard";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { getStats } from "./lib/api";
import type { Stats } from "./lib/rsvp";

const storageKey = "maryam-mehran-party:2026:v2:admin";

function readToken() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("key");
  if (token) {
    // Owner capability is handed over in the fragment, never a query string or
    // HTTP request URL. Remove it from browser history immediately.
    history.replaceState(null, "", `${location.pathname}#stats`);
    return token;
  }
  try { return sessionStorage.getItem(storageKey) ?? ""; } catch { return ""; }
}

export default function Results() {
  const [token, setToken] = useState(readToken);
  const [authorizedToken, setAuthorizedToken] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(value: string) {
    if (!value.trim()) return;
    setBusy(true); setError("");
    try {
      const data = await getStats(value.trim());
      setAuthorizedToken(value.trim()); setStats(data);
      try { sessionStorage.setItem(storageKey, value.trim()); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "آمار دریافت نشد؛ دوباره امتحان کن.");
      try { sessionStorage.removeItem(storageKey); } catch {}
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token) void signIn(token); }, []);
  function submit(event: FormEvent) { event.preventDefault(); if (!busy) void signIn(token); }
  function signOut() {
    setStats(null); setAuthorizedToken(""); setToken(""); setError("");
    try { sessionStorage.removeItem(storageKey); } catch {}
  }
  if (stats && authorizedToken) return <Dashboard adminToken={authorizedToken} initialStats={stats} onSignOut={signOut} />;
  return <main className="party-shell"><section className="survey-card results-login">
    <p className="eyebrow">مریم و مهران · ۷ آبان</p><h1>آمار مهمونی 🎉</h1>
    <p>کد مدیریت را وارد کن تا جواب دوستان را ببینی.</p>
    <form onSubmit={submit}>
      <label htmlFor="admin-key">کد مدیریت</label>
      <Input id="admin-key" type="password" className="party-input" value={token} autoComplete="off" dir="ltr" onChange={e => { setToken(e.target.value); setError(""); }} />
      {error && <p className="error-message" role="alert">{error}</p>}
      <Button type="submit" className="continue-button" disabled={busy || !token.trim()}>{busy ? "در حال دریافت آمار…" : "مشاهده آمار"}</Button>
    </form>
    <a className="plain-link" href="../">بازگشت به کارت دعوت</a>
  </section></main>;
}
