"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";
import { faNumber, type Stats } from "@/lib/rsvp";
import { getStats } from "@/lib/api";

export default function Dashboard({ adminToken, onSignOut, initialStats }: { adminToken: string; onSignOut: () => void; initialStats: Stats }) {
  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(new Date());
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getStats(adminToken);
      setStats(data); setUpdated(new Date());
    } catch (e) { setError(e instanceof Error ? e.message : "اتصال برقرار نشد؛ دوباره تلاش کنید."); }
    finally { setLoading(false); }
  }, [adminToken]);
  const number = (key: Exclude<keyof Stats, "guests">) => stats ? faNumber(stats[key]) : "—";
  return <main className="dashboard-shell">
    <header className="dashboard-header"><div><p className="eyebrow">مریم و مهران · ۷ آبان</p><h1>آمار مهمونی <span aria-hidden="true">🎉</span></h1></div><div className="dashboard-actions"><Button className="refresh-button" variant="secondary" onClick={refresh} disabled={loading}>{loading ? "در حال دریافت…" : "به‌روزرسانی آمار"}</Button><Button variant="ghost" className="plain-link" onClick={onSignOut}>خروج</Button></div></header>
    <div className="stats-meta" aria-live="polite">{updated ? `آخرین دریافت: ${updated.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" })}` : "در حال دریافت پاسخ‌ها…"}</div>
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="totals-grid" aria-label="آمار حضور">
      <article className="metric"><span>کل پاسخ‌ها ✍️</span><strong>{number("total")}</strong></article>
      <article className="metric metric-yes"><span>می‌آیند 🥳</span><strong>{number("yes")}</strong></article>
      <article className="metric"><span>نمی‌آیند ❤️</span><strong>{number("no")}</strong></article>
    </section>
    <section className="orders-grid" aria-label="انتخاب شام و نوشیدنی">
      <article className="order-card"><h2>شام چی می‌خوریم؟ 🍽️</h2><Count label="جوجه 🍗" value={stats?.joojeh} total={stats?.yes} /><Count label="کباب کوبیده 🥩" value={stats?.koobideh} total={stats?.yes} /></article>
      <article className="order-card"><h2>نوشیدنی چی داریم؟ 🍹</h2><Count label="مشروبات الکلی 🍷" value={stats?.alcoholic} total={stats?.yes} /><Count label="غیرالکلی 🧃" value={stats?.non_alcoholic} total={stats?.yes} /></article>
    </section>
    <p className="count-note">تعداد غذا و نوشیدنی بر اساس کسانی است که جواب نهایی‌شان «میام» است.</p>
    <section className="guest-list"><h2>جواب دوستان</h2>
      {stats?.total === 0 ? <div className="empty-state"><span aria-hidden="true">📬</span><p>هنوز کسی جواب نداده؛ اولین پاسخ همین‌جا ظاهر می‌شود.</p></div> : <Table className="guest-table"><TableCaption>نام، حضور و انتخاب هر نفر؛ تازه‌ترین پاسخ‌ها در ابتدای فهرست.</TableCaption><TableHeader><TableRow><TableHead>اسم و فامیل</TableHead><TableHead>حضور</TableHead><TableHead>شام</TableHead><TableHead>نوشیدنی</TableHead></TableRow></TableHeader><TableBody>{stats?.guests.map((guest, i) => <TableRow key={`${i}-${guest.updated_at}`}><TableCell className="guest-name">{guest.name}</TableCell><TableCell><span className={`attendance-tag ${guest.attending ? "is-yes" : ""}`}>{guest.attending ? "میام 🥳" : "نمی‌تونم بیام ❤️"}</span></TableCell><TableCell>{guest.attending ? guest.meal === "joojeh" ? "جوجه 🍗" : "کباب کوبیده 🥩" : "—"}</TableCell><TableCell>{guest.attending ? guest.drink === "alcoholic" ? "الکلی 🍷" : "غیرالکلی 🧃" : "—"}</TableCell></TableRow>)}</TableBody></Table>}
    </section>
  </main>;
}
function Count({ label, value, total }: { label: string; value?: number; total?: number }) {
  return <div className="order-count"><div><span>{label}</span><strong>{value === undefined ? "—" : `${faNumber(value)} نفر`}</strong></div><div className="count-track" aria-hidden="true"><span style={{ width: `${total ? ((value ?? 0) / total) * 100 : 0}%` }} /></div></div>;
}
