/** Book-a-demo form vocabulary + validation. Plain module (no `server-only`,
 * no client-only APIs) so the browser can validate for instant feedback and
 * the future Server Action can re-run the exact same rules — never trust the
 * client's pass. See docs/HANDOFF_BOOK_A_DEMO.md. */

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu & Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Chandigarh", "Ladakh",
] as const;

export const MEMBER_RANGES = ["Under 100", "100–300", "300–600", "600–1,000", "1,000+"] as const;
export const BRANCH_RANGES = ["1", "2–3", "4–10", "10+"] as const;

export type DemoFormValues = {
  gym: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  branches: string;
  members: string;
  message: string;
};

export const EMPTY_DEMO_FORM: DemoFormValues = {
  gym: "", name: "", phone: "", email: "", city: "", state: "", branches: "", members: "", message: "",
};

export type DemoFormErrors = Partial<Record<keyof DemoFormValues | "date" | "time", string>>;

/** Order the form is read top-to-bottom, used to focus the first invalid field. */
export const FIELD_ORDER = ["gym", "name", "phone", "email", "city", "state", "branches", "members", "message", "date", "time"] as const;

export function normalizeDemoPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

export function normalizeDemoValues(v: DemoFormValues): DemoFormValues {
  return { ...v, gym: v.gym.trim(), name: v.name.trim(), city: v.city.trim(),
    phone: normalizeDemoPhone(v.phone), email: v.email.trim().toLowerCase(), message: v.message.trim() };
}

/** `date` is an IST `YYYY-MM-DD` key; `time` is an index into DEMO_TIMES. */
export function validateDemoRequest(v: DemoFormValues, date: string | null, time: number | null): DemoFormErrors {
  const e: DemoFormErrors = {};
  if (!v.gym.trim()) e.gym = "Enter your gym's name";
  else if (v.gym.trim().length > 160) e.gym = "Keep the gym name within 160 characters";
  if (!v.name.trim()) e.name = "Enter your name";
  else if (v.name.trim().length > 100) e.name = "Keep your name within 100 characters";
  const digits = normalizeDemoPhone(v.phone);
  if (!digits) e.phone = "Enter a number we can reach you on";
  else if (!/^\+?[\d\s()-]+$/.test(v.phone.trim()) || !/^[6-9]\d{9}$/.test(digits)) e.phone = "Enter a 10-digit mobile number";
  if (!v.email.trim()) e.email = "Enter your email";
  else if (v.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = "This email doesn't look right. Check for typos.";
  if (!v.city.trim()) e.city = "Enter your city";
  else if (v.city.trim().length > 120) e.city = "Keep your city within 120 characters";
  if (!(INDIAN_STATES as readonly string[]).includes(v.state)) e.state = "Choose your state";
  if (!(BRANCH_RANGES as readonly string[]).includes(v.branches)) e.branches = "Choose how many branches you have";
  if (!(MEMBER_RANGES as readonly string[]).includes(v.members)) e.members = "Choose an approximate member count";
  if (v.message.trim().length > 1000) e.message = "Keep your message within 1,000 characters";
  if (!date) e.date = "Choose a date for your demo";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date) e.date = "Choose a valid demo date";
  if (time == null || !Number.isInteger(time) || time < 0 || time > 17) e.time = "Choose a time that works for you";
  return e;
}
