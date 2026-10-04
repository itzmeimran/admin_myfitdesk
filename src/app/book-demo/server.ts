import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { createServiceClientForEnvironment } from "@/core/db/service-client";
import { loose } from "@/core/db/loose-client";
import { isAdminEnvironment } from "@/core/config/environments";
import { getServiceSupabaseCredentials } from "@/core/config/server";
import type { DemoAvailability, DemoCalendar } from "@/features/demo-requests/slots";
import { z } from "zod";

/** Public requests never select credentials from an admin cookie or client input. */
export async function createDemoClient() {
  const configured = process.env.BOOK_DEMO_ENVIRONMENT;
  if (configured && !isAdminEnvironment(configured)) throw new Error("Invalid Book Demo environment");
  const environment = isAdminEnvironment(configured) ? configured : (process.env.VERCEL_ENV === "production" ? "prod" : "dev");
  const expected = environment === "dev" ? "pgedlnxuuelmtpmbkdwm" : "clbphruocsqsmklmrloq";
  if (new URL(getServiceSupabaseCredentials(environment).url).hostname !== `${expected}.supabase.co`) throw new Error("Book Demo project mismatch");
  const client = await createServiceClientForEnvironment(environment);
  return loose(client);
}

export function demoContactEmail() {
  return z.email().safeParse(process.env.BOOK_DEMO_SUPPORT_EMAIL).data ?? "hello@myfitdesk.com";
}

export function demoMarketingOrigin() {
  const raw = process.env.MARKETING_ORIGIN || "https://www.myfitdesk.app";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
  } catch { /* Use the known public home when configuration is invalid. */ }
  return "https://www.myfitdesk.app";
}

export function demoIpKey(requestHeaders: Headers): string {
  // Vercel overwrites this header at its edge. A generic self-hosted proxy must
  // explicitly strip/overwrite X-Forwarded-For; otherwise use a shared bucket.
  const raw = process.env.VERCEL === "1" ? requestHeaders.get("x-vercel-forwarded-for")
    : process.env.BOOK_DEMO_TRUST_PROXY === "true" ? requestHeaders.get("x-forwarded-for") : null;
  const candidate = raw?.split(",")[0]?.trim() ?? "";
  const ip = isIP(candidate) ? candidate : "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

export function demoContactKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function allowDemoRequest(client: Awaited<ReturnType<typeof createDemoClient>>, key: string, limit: number, windowMs: number) {
  // Copy of the tenant shared-DB pattern; public demo writes fail closed on outage.
  const { data, error } = await client.rpc("consume_rate_limit", { p_key: `website-demo:${key}`, p_limit: limit, p_window_ms: windowMs });
  if (error || typeof data !== "boolean") throw new Error("Demo rate limiter unavailable");
  return data;
}

const statusSchema = z.enum(["open", "past", "closed", "full"]);
const availabilitySchema = z.object({ date: z.string(), status: statusSchema, openSlots: z.array(z.number().int().min(0).max(17)) });

export async function readDemoCalendar(): Promise<DemoCalendar | null> {
  try {
    const client = await createDemoClient();
    const { data, error } = await client.rpc("website_demo_calendar");
    const result = z.record(z.string(), statusSchema).safeParse(data);
    return !error && result.success ? result.data : null;
  } catch { return null; }
}

export async function readDemoAvailability(client: Awaited<ReturnType<typeof createDemoClient>>, date: string): Promise<DemoAvailability | null> {
  const { data, error } = await client.rpc("website_demo_availability", { p_date: date });
  const result = availabilitySchema.safeParse(data);
  return !error && result.success && result.data.date === date ? result.data : null;
}
