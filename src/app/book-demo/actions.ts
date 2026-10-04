"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { dayStatus, demoWindow } from "@/features/demo-requests/slots";
import { normalizeDemoValues, validateDemoRequest } from "@/features/demo-requests/validation";
import { isEmailConfigured } from "@/core/config/email";
import { sendSystemEmail } from "@/core/email/system-email";
import { demoRequestEmail } from "@/core/email/templates";
import { allowDemoRequest, createDemoClient, demoContactEmail, demoContactKey, demoIpKey, readDemoAvailability } from "./server";

const inputSchema = z.object({
  gym: z.string().max(200), name: z.string().max(150), phone: z.string().max(40), email: z.string().max(300),
  city: z.string().max(150), state: z.string().max(80), branches: z.string().max(20), members: z.string().max(30),
  message: z.string().max(1200), date: z.string().max(10), time: z.number().int().min(0).max(17),
  website: z.string().max(200), requestId: z.uuid(),
});
export type DemoSubmitResult = { ok: true; returning: boolean } | { ok: false; error: string };
const FAILURE = "We couldn't send your request. Please try again in a little while.";

export async function submitDemoRequest(input: unknown): Promise<DemoSubmitResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.website.trim()) return { ok: false, error: FAILURE };
  const data = parsed.data;
  if (Object.keys(validateDemoRequest(data, data.date, data.time)).length) return { ok: false, error: "Please check your details and try again." };
  const values = normalizeDemoValues(data);
  if (dayStatus(data.date, demoWindow()) !== "open") return { ok: false, error: "Please choose an available date within the next 30 days." };
  try {
    const client = await createDemoClient();
    if (!await allowDemoRequest(client, `submit-ip:${demoIpKey(await headers())}`, 5, 3_600_000)) return { ok: false, error: FAILURE };
    for (const identity of [values.phone, values.email]) {
      if (!await allowDemoRequest(client, `submit-contact:${demoContactKey(identity)}`, 3, 3_600_000)) return { ok: false, error: FAILURE };
    }
    const availability = await readDemoAvailability(client, data.date);
    if (!availability) return { ok: false, error: FAILURE };
    // The RPC rechecks under the same lock used by staff confirmation.
    const payload = { gym: values.gym, name: values.name, phone: `+91${values.phone}`, email: values.email,
      city: values.city, state: values.state, branches: values.branches, members: values.members, message: values.message };
    const { data: result, error } = await client.rpc("submit_website_demo", {
      p_id: data.requestId, p_payload: payload, p_date: data.date, p_time_index: data.time,
    });
    if (error) return { ok: false, error: error.code === "P0002" ? "That time is no longer available. Please choose another time." : FAILURE };
    const saved = z.object({ returning: z.boolean(), created: z.boolean() }).safeParse(result);
    if (!saved.success) return { ok: false, error: FAILURE };
    if (saved.data.created && isEmailConfigured()) {
      after(async () => {
        const receipt = demoRequestEmail({ ...payload, date: data.date, time: data.time, supportEmail: demoContactEmail() });
        const salesEmail = z.email().safeParse(process.env.BOOK_DEMO_SALES_EMAIL).data;
        const outcomes = await Promise.allSettled([
          sendSystemEmail({ to: payload.email, ...receipt }),
          ...(salesEmail ? [sendSystemEmail({ to: salesEmail, ...demoRequestEmail({ ...payload, date: data.date, time: data.time, supportEmail: demoContactEmail(), sales: true }) })] : []),
        ]);
        if (outcomes.some((r) => r.status === "rejected" || !r.value.ok)) console.error("book-demo: notification delivery failed");
      });
    }
    return { ok: true, returning: saved.data.returning };
  } catch { return { ok: false, error: FAILURE }; }
}
