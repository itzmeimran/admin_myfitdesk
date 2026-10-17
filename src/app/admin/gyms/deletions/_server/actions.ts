"use server";

import { z } from "zod";
import { assertPermission } from "@/core/auth/access";
import { createServiceClientForEnvironment } from "@/core/db/service-client";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { loose } from "@/core/db/loose-client";
import { inspectGymCleanup } from "@/core/gym-deletion/inspection";
import type { CleanupInspection } from "@/features/gyms/deletion-inspection";

export async function inspectDeletionCleanup(organizationId: string): Promise<{ data: CleanupInspection | null; error: string | null }> {
  await assertPermission("gyms.view");
  if (!z.string().uuid().safeParse(organizationId).success) return { data: null, error: "Invalid gym ID." };
  try {
    const environment = await getActiveAdminEnvironment();
    const client = await createServiceClientForEnvironment(environment);
    // Restrict this privileged read to an actual recorded gym deletion.
    const [audit, job] = await Promise.all([
      client.from("admin_audit_log").select("id").eq("target_organization_id", organizationId).in("action", ["organizations.delete", "organization.deleted", "organization.deletion_completed"]).limit(1),
      loose(client).from("gym_deletion_jobs").select("id").eq("organization_id", organizationId).not("database_deleted_at", "is", null).limit(1),
    ]);
    const missingJobs = job.error?.code === "42P01" || job.error?.code === "PGRST205";
    if (audit.error || (job.error && !missingJobs) || (!audit.data?.length && !job.data?.length)) return { data: null, error: "A database deletion record is required before inspecting cleanup." };
    return { data: await inspectGymCleanup(client, environment, organizationId), error: null };
  } catch { return { data: null, error: "Cleanup inspection could not finish. Try again or check this environment's storage and server configuration." }; }
}
