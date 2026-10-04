import { z } from "zod";
import { demoWindow, dayStatus } from "@/features/demo-requests/slots";
import { allowDemoRequest, createDemoClient, demoIpKey, readDemoAvailability } from "../server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!z.iso.date().safeParse(date).success || dayStatus(date, demoWindow()) === "past") {
    return Response.json({ error: "Choose a date within the next 30 days." }, { status: 400 });
  }
  try {
    const client = await createDemoClient();
    if (!await allowDemoRequest(client, `availability:${demoIpKey(request.headers)}`, 90, 60_000)) {
      return Response.json({ error: "Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
    }
    const result = await readDemoAvailability(client, date);
    if (result) return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { /* Generic public failure; never expose a DB/configuration error. */ }
  return Response.json({ error: "We couldn't load times. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
