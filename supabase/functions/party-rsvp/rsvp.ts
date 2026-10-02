export type Meal = "joojeh" | "koobideh";
export type Drink = "alcoholic" | "non_alcoholic";
export type RSVP = { name: string; attending: boolean; meal: Meal | null; drink: Drink | null };
export type GuestRow = { name: string; attending: number; meal: Meal | null; drink: Drink | null; updated_at: number };
export type Stats = { total: number; yes: number; no: number; joojeh: number; koobideh: number; alcoholic: number; non_alcoholic: number; guests: GuestRow[] };

export function validateRSVP(input: unknown): RSVP {
  if (!input || typeof input !== "object") throw new Error("جواب‌ها رو کامل کن تا ثبتشون کنیم 😄");
  const v = input as Record<string, unknown>;
  if (typeof v.name !== "string") throw new Error("اسم و فامیلت رو بنویس ✍️");
  const name = v.name.normalize("NFC").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 100) throw new Error("اسم و فامیلت باید بین ۲ تا ۱۰۰ حرف باشه.");
  if (typeof v.attending !== "boolean") throw new Error("اول بگو میای یا نمیای 😄");
  if (!v.attending) return { name, attending: false, meal: null, drink: null };
  if (v.meal !== "joojeh" && v.meal !== "koobideh") throw new Error("شامت رو انتخاب کن 🍽️");
  if (v.drink !== "alcoholic" && v.drink !== "non_alcoholic") throw new Error("نوشیدنیت رو هم انتخاب کن 🍹");
  return { name, attending: true, meal: v.meal, drink: v.drink };
}

export const faNumber = (number: number) => new Intl.NumberFormat("fa-IR").format(number);
