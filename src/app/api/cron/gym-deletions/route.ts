import { timingSafeEqual } from "node:crypto";
import { isAdminEnvironment } from "@/core/config/environments";
import { createServiceClientForEnvironment } from "@/core/db/service-client";
import { loose } from "@/core/db/loose-client";
import { deletionStorageConfig, runGymDeletionWorker } from "@/core/gym-deletion/worker";
import { getServiceSupabaseCredentials } from "@/core/config/server";
import type { AdminEnvironment } from "@/core/config/environments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function assertProject(environment: AdminEnvironment) {
  const expected = environment === "dev" ? "pgedlnxuuelmtpmbkdwm.supabase.co" : "clbphruocsqsmklmrloq.supabase.co";
  if (new URL(getServiceSupabaseCredentials(environment).url).hostname !== expected) throw new Error("Deletion project does not match the selected environment");
}

function authorize(request: Request) {
  const environment = new URL(request.url).searchParams.get("environment");
  if (!environment || !isAdminEnvironment(environment)) return null;
  const secret = process.env[`GYM_DELETION_CRON_SECRET_${environment.toUpperCase()}`]?.trim();
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret) return null;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? environment : null;
}

export async function GET(request: Request) {
  const environment = authorize(request);
  if (!environment) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertProject(environment);
    deletionStorageConfig(environment);
    if (deletionStorageConfig(environment).length) deletionStorageConfig(environment === "dev" ? "prod" : "dev");
    return Response.json({ ready: true, environment });
  } catch { return Response.json({ ready: false, environment }, { status: 503 }); }
}

export async function POST(request: Request) {
  const environment = authorize(request);
  if (!environment) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    assertProject(environment);
    const result = await runGymDeletionWorker(loose(await createServiceClientForEnvironment(environment)), environment, async (organizationId, inventory) => {
      const peerEnvironment = environment === "dev" ? "prod" : "dev";
      assertProject(peerEnvironment);
      const peerInventory = deletionStorageConfig(peerEnvironment);
      if (!inventory.some(bucket => peerInventory.some(peer => peer.bucket === bucket.bucket && peer.accountId === bucket.accountId))) return;
      const peer = await createServiceClientForEnvironment(peerEnvironment);
      const check = await peer.from("organizations").select("id").eq("id", organizationId).maybeSingle();
      if (check.error || check.data) throw new Error("A shared storage folder may still belong to the other environment");
    });
    return Response.json(result, { status: result.failed ? 500 : 200 });
  } catch { return Response.json({ error: "Gym cleanup could not run" }, { status: 503 }); }
}
