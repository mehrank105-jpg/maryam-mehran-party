"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { faNumber, validateRSVP, type Meal, type Drink, type RSVP } from "@/lib/rsvp";
import { ensureGuestSession, saveRSVP } from "@/lib/api";

type Step = "attendance" | "persuade" | "name" | "meal" | "drink" | "success";
const titles: Record<Step, string> = {
  attendance: "خب، ۷ آبان میای مهمونی مریم و مهران؟",
  persuade: "مطمئنی نمیای؟ بیا دیگه، بدون تو صفا نداره!",
  name: "اسم و فامیلت رو بنویس؛ بدونیم این جواب مال کیه",
  meal: "شام چی می‌خوری؟ انتخاب سخت زندگی!",
  drink: "نوشیدنی چی میل داری؟", success: "",
};
const emojis: Record<Step, string> = { attendance: "🥳", persuade: "🥺", name: "✍️", meal: "🍽️", drink: "🍹", success: "🎉" };
const phases: Record<Step, number> = { attendance: 0, persuade: 0, name: 1, meal: 2, drink: 3, success: 4 };

export default function Survey() {
  const [step, setStep] = useState<Step>("attendance");
  const [firstAnswer, setFirstAnswer] = useState("");
  const [secondAnswer, setSecondAnswer] = useState("");
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<Meal | "">("");
  const [drink, setDrink] = useState<Drink | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedValue, setSavedValue] = useState<RSVP | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const submissionLock = useRef(false);
  const touched = useRef(false);
  const attending = firstAnswer === "yes" || (firstAnswer === "no" && secondAnswer === "yes");
  const total = firstAnswer === "no" && secondAnswer === "no" ? 2 : 4;
  const activePhase = phases[step];

  useEffect(() => { void ensureGuestSession().catch(() => {}); }, []);
  useEffect(() => { if (touched.current) heading.current?.focus({ preventScroll: true }); }, [step]);
  const move = (next: Step) => { touched.current = true; setError(""); setStep(next); };

  const submit = useCallback(async (raw: unknown) => {
    const value = validateRSVP(raw);
    if (submissionLock.current) throw new Error("جوابت داره ثبت می‌شه؛ یه لحظه صبر کن 😄");
    submissionLock.current = true; setBusy(true); setError("");
    try {
      await saveRSVP(value);
      setName(value.name); setFirstAnswer(value.attending ? "yes" : "no"); setSecondAnswer(value.attending ? "" : "no");
      setMeal(value.meal ?? ""); setDrink(value.drink ?? ""); setSavedValue(value);
      touched.current = true; setStep("success");
      return { saved: true, attending: value.attending };
    } catch (e) { setError(e instanceof Error ? e.message : "اتصال برقرار نشد؛ جواب‌ها رو نگه داشتیم، دوباره امتحان کن ❤️"); throw e; }
    finally { submissionLock.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "submit_party_rsvp", title: "ثبت پاسخ مهمونی مریم و مهران",
        description: "Save the guest's final attendance, name, and (only if attending) dinner and drink choices. Updates this page to the same saved confirmation as the form.",
        inputSchema: { type: "object", properties: { name: { type: "string", minLength: 2, maxLength: 100 }, attending: { type: "boolean" }, meal: { enum: ["joojeh", "koobideh", null] }, drink: { enum: ["alcoholic", "non_alcoholic", null] } }, required: ["name", "attending"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: submit,
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, [submit]);

  async function next(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step === "attendance") return move(firstAnswer === "yes" ? "name" : "persuade");
    if (step === "persuade") return move("name");
    if (step === "name") {
      try { validateRSVP({ name, attending: false }); } catch (e) { setError((e as Error).message); return; }
      if (attending) return move("meal");
    }
    if (step === "meal") return move("drink");
    try { await submit({ name, attending, meal: attending ? meal : null, drink: attending ? drink : null }); } catch {}
  }
  function back() {
    if (step === "persuade") return move("attendance");
    if (step === "name") return move(firstAnswer === "no" ? "persuade" : "attendance");
    if (step === "meal") return move("name");
    if (step === "drink") return move("meal");
  }
  const finalStep = step === "drink" || (step === "name" && !attending);
  const canContinue = step === "attendance" ? !!firstAnswer : step === "persuade" ? !!secondAnswer : step === "name" ? name.trim().length >= 2 : step === "meal" ? !!meal : !!drink;
  const options = step === "attendance" ? [
    { value: "yes", emoji: "💃🕺", label: "میام، آمادهٔ ترکوندنم!" }, { value: "no", emoji: "😢", label: "نمی‌تونم بیام" },
  ] : step === "persuade" ? [
    { value: "yes", emoji: "😂🎉", label: "باشه بابا، میام!" }, { value: "no", emoji: "❤️", label: "دلم می‌خواست، ولی واقعاً نمی‌تونم" },
  ] : step === "meal" ? [
    { value: "joojeh", emoji: "🍗😋", label: "جوجه" }, { value: "koobideh", emoji: "🥩🔥", label: "کباب کوبیده" },
  ] : [
    { value: "alcoholic", emoji: "🍷😎", label: "مشروبات الکلی" }, { value: "non_alcoholic", emoji: "🧃😇", label: "غیرالکلی لطفاً" },
  ];
  const currentValue = step === "attendance" ? firstAnswer : step === "persuade" ? secondAnswer : step === "meal" ? meal : drink;
  const choose = (value: string) => {
    setError("");
    if (step === "attendance") { setFirstAnswer(value); setSecondAnswer(""); }
    else if (step === "persuade") setSecondAnswer(value);
    else if (step === "meal") setMeal(value as Meal);
    else setDrink(value as Drink);
  };
  return <main className="party-shell">
    <div className="ambient ambient-one" aria-hidden="true" /><div className="ambient ambient-two" aria-hidden="true" />
    <header className="party-header">
      <img className="couple-photo" src={`${import.meta.env.BASE_URL}couple.jpg`} alt="مریم و مهران" width="74" height="99" />
      <div><p className="eyebrow">بالاخره نوبت ما شد!</p><h1>مریم و مهران</h1><p className="event-date">پنجشنبه، ۷ آبان <span aria-hidden="true">·</span> ۱۹ تا هر وقت بیرونمون کنن 😄</p></div>
    </header>
    <section className={`survey-card ${step === "success" ? "is-complete" : ""}`} aria-label="پرسشنامه مهمونی">
      {step !== "success" ? <>
        <div className="step-meta"><span>{step === "persuade" ? "یه بار دیگه فکر کن 😄" : `سؤال ${faNumber(activePhase + 1)} از ${faNumber(total)}`}</span><span>{["حضور", "اسم شما", "شام", "نوشیدنی"][activePhase]}</span></div>
        <Progress className="party-progress" value={((activePhase + 1) / total) * 100} aria-label="پیشرفت پرسشنامه" />
        <form onSubmit={next}>
          <div className="question-scene" key={step}>
            <div className={`question-emoji ${step === "persuade" ? "please-emoji" : ""}`} aria-hidden="true">{emojis[step]}</div>
            <h2 ref={heading} tabIndex={-1} id="question-title">{titles[step]}</h2>
            {step === "name" ? <div className="name-field"><label htmlFor="guest-name" className="sr-only">اسم و فامیل</label><Input id="guest-name" className="party-input" autoComplete="name" placeholder="مثلاً: سارا محمدی" value={name} maxLength={100} onChange={e => { setName(e.target.value); setError(""); }} aria-describedby={error ? "form-error" : undefined} /></div> : <RadioGroup className="party-choices" value={currentValue} onValueChange={choose} aria-labelledby="question-title" dir="rtl">{options.map(option => <label key={option.value} className={`choice ${currentValue === option.value ? "choice-selected" : ""}`}><RadioGroupItem value={option.value} className="choice-radio" aria-label={option.label} /><span className="choice-label">{option.label}</span><span className="choice-emoji" aria-hidden="true">{option.emoji}</span></label>)}</RadioGroup>}
          </div>
          {error && <p id="form-error" className="error-message" role="alert">{error}</p>}
          <div className="form-actions"><Button type="submit" className="continue-button" disabled={!canContinue || busy}>{busy ? "یه لحظه، داریم ثبتش می‌کنیم…" : finalStep ? attending ? "ثبت جوابم 🎉" : "ثبت جوابم ❤️" : step === "attendance" ? "بریم سؤال بعد 😎" : "ادامه"}</Button>{step !== "attendance" && <Button type="button" className="back-button" variant="ghost" disabled={busy} onClick={back}>برگشت</Button>}</div>
        </form>
      </> : <div className="success-scene">
        {savedValue?.attending && <div className="confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--x": `${(i * 37 + 11) % 100}%`, "--delay": `${(i % 9) * .11}s`, "--tilt": `${i * 31}deg`, "--color": ["#ffd86b", "#ff7fb7", "#c4a2ff", "#f7ebff"][i % 4] } as CSSProperties} />)}</div>}
        <div className="success-emoji" aria-hidden="true">{savedValue?.attending ? "🥳🎊" : "❤️"}</div>
        <h2 ref={heading} tabIndex={-1}>{savedValue?.name}، جوابت ثبت شد!</h2>
        <p>{savedValue?.attending ? "پس منتظرتیم! انرژیت رو برای رقص نگه دار 😄" : "جات خالی می‌مونه؛ امیدواریم خیلی زود ببینیمت ❤️"}</p>
        {savedValue?.attending && <dl className="receipt"><div><dt>حضور</dt><dd>میام 🥳</dd></div><div><dt>شام</dt><dd>{savedValue.meal === "joojeh" ? "جوجه 🍗" : "کباب کوبیده 🥩"}</dd></div><div><dt>نوشیدنی</dt><dd>{savedValue.drink === "alcoholic" ? "الکلی 🍷" : "غیرالکلی 🧃"}</dd></div></dl>}
        <Button className="back-button edit-button" variant="ghost" onClick={() => move("attendance")}>اصلاح جوابم</Button>
      </div>}
    </section>
    <footer className="party-footer"><span aria-hidden="true">✨</span> هیچ بهونه‌ای برای نیومدن پذیرفته نیست! <span aria-hidden="true">✨</span></footer>
  </main>;
}
