import { timingSafeEqual } from "node:crypto";
import { dispatchRecoveryWorkflow } from "@/core/disaster-recovery/github-dispatch";

export const dynamic = "force-dynamic";

/**
 * Reliable hourly trigger for the backup worker.
 *
 * GitHub's own `schedule:` cron is best-effort — runs start late or are dropped
 * outright — so the workflow alone cannot promise hourly recovery points. Point
 * any real scheduler (Vercel Cron on a plan that allows hourly, cron-job.org,
 * Supabase pg_cron + pg_net, ...) at this route once an hour and it dispatches
 * the production workflow. Development backups are manual-only. The worker
 * de-duplicates, so GitHub's cron and this route
 * running in the same hour produce one backup, not two.
 *
 * Fail-closed: without `CRON_SECRET` configured the route refuses every call.
 * It carries no user session, no database access, and returns no secrets; it
 * can only ask GitHub to run the already-defined scheduled backup.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });

  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await dispatchRecoveryWorkflow("database-backup.yml", {
    environment: "production",
    backup_type: "scheduled",
  });
  if (!result.dispatched) return Response.json({ dispatched: false, reason: result.reason }, { status: 502 });
  return Response.json({ dispatched: true });
}
