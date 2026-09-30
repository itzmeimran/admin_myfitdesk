"use server";

import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { checkPermission } from "@/core/auth/access";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { isR2TargetConfigured, r2Client, type R2Target } from "@/core/storage/r2-client";
import { getTransporter } from "@/core/email/transporter";
import { describeEmailError } from "@/core/email/errors";
import { isEmailConfigured } from "@/core/config/email";

/**
 * "Test connection" buttons. Each runs on the server with credentials the
 * browser never sees, performs one harmless read-only probe, and returns only
 * pass/fail plus a short, scrubbed reason — no endpoint, key or raw error body.
 */

export type ConnectionTestResult = { ok: boolean; message: string; ms: number };

async function timed(run: () => Promise<string>): Promise<ConnectionTestResult> {
  const started = Date.now();
  try {
    const message = await run();
    return { ok: true, message, ms: Date.now() - started };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    return { ok: false, message: `Failed (${name}).`, ms: Date.now() - started };
  }
}

export async function testDatabaseConnection(): Promise<ConnectionTestResult> {
  const allowed = await checkPermission("integrations.view");
  if (!allowed.ok) return { ok: false, message: allowed.error, ms: 0 };

  const supabase = await createClient();
  const started = Date.now();
  const { error } = await loose(supabase).rpc("admin_system_info");
  if (error) {
    // "not installed" still proves the database answered; report it honestly.
    if (error.code === "PGRST202") return { ok: true, message: "Database reachable (Settings migration not applied yet).", ms: Date.now() - started };
    return { ok: false, message: "The database didn't answer correctly.", ms: Date.now() - started };
  }
  return { ok: true, message: "Database reachable and responding.", ms: Date.now() - started };
}

export async function testR2Connection(target: R2Target): Promise<ConnectionTestResult> {
  const allowed = await checkPermission("integrations.view");
  if (!allowed.ok) return { ok: false, message: allowed.error, ms: 0 };
  if (!isR2TargetConfigured(target)) return { ok: false, message: "Not configured on this deployment.", ms: 0 };

  return timed(async () => {
    const { client, bucket } = r2Client(target);
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return "Bucket reachable with the configured credentials.";
  });
}

export async function testEmailConnection(): Promise<ConnectionTestResult> {
  const allowed = await checkPermission("integrations.view");
  if (!allowed.ok) return { ok: false, message: allowed.error, ms: 0 };
  if (!isEmailConfigured()) return { ok: false, message: "SMTP isn't configured on this deployment.", ms: 0 };

  const started = Date.now();
  try {
    await getTransporter().verify();
    return { ok: true, message: "SMTP server accepted the connection and login.", ms: Date.now() - started };
  } catch (error) {
    return { ok: false, message: describeEmailError(error), ms: Date.now() - started };
  }
}
