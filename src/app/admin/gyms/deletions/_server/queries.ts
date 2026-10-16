import "server-only";
import { assertPermission } from "@/core/auth/access";
import { createServiceClient } from "@/core/db/service-client";
import { loose } from "@/core/db/loose-client";
import type { GymDeletionRow } from "@/features/gyms/deletion-display";

export type DeletionView = "pending" | "jobs" | "deleted";
type Gym = { id: string; name: string; gym_code: string | null; city: string | null; deletion_requested_at: string | null };
type Job = { id: string; organization_id: string; requested_at: string; purge_after: string; state: GymDeletionRow["state"]; completed_at: string | null; database_deleted_at: string | null; requested_by: string | null; reason: string | null; last_error: string | null };
type Audit = { id: number; target_organization_id: string; at: string; admin_id: string | null; actor_role: string | null; gym_name: string | null; gym_code: string | null; city: string | null; requested_at: string | null };
type Staff = { organization_id: string; user_id: string; first_name: string | null; last_name: string | null; email: string | null; role: string };
const GYM_FIELDS = "id,name,gym_code,city,deletion_requested_at";
const JOB_FIELDS = "id,organization_id,requested_at,purge_after,state,completed_at,database_deleted_at,requested_by,reason,last_error";
// Only project the display fields; never return entire historical snapshots.
const AUDIT_FIELDS = "id,target_organization_id,at,admin_id,actor_role,gym_name:old_values->>name,gym_code:old_values->>gym_code,city:old_values->>city,requested_at:old_values->>deletion_requested_at";
const DELETE_ACTIONS = ["organizations.delete", "organization.deleted", "organization.deletion_completed"];
function missingJobs(error: { code?: string } | null) { return error?.code === "42P01" || error?.code === "PGRST205"; }
function staffName(staff: Staff | undefined) {
  if (!staff) return null;
  return [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim() || (staff.email?.endsWith("@staff.myfitdesk.internal") ? null : staff.email);
}

/** Cross-tenant reads stay server-only and require the selected environment's
 * own gyms.view permission BEFORE creating the elevated client. No new grants,
 * tenant RLS exceptions, schema changes or deletion writes are needed. */
export async function getGymDeletions({ view, limit, offset }: { view: DeletionView; limit: number; offset: number }) {
  await assertPermission("gyms.view");
  const empty = { rows: [] as GymDeletionRow[], total: 0, counts: { pending: null, jobs: null, deleted: null } as Record<DeletionView, number | null>, jobsAvailable: false };
  try {
    const db = loose(await createServiceClient());
    const [pendingCount, jobsCount, deletedCount] = await Promise.all([
      db.from("organizations").select("id", { count: "exact", head: true }).not("deletion_requested_at", "is", null),
      db.from("gym_deletion_jobs").select("id", { count: "exact", head: true }),
      db.from("admin_audit_log").select("id", { count: "exact", head: true }).in("action", DELETE_ACTIONS),
    ]);
    if (pendingCount.error || deletedCount.error || (jobsCount.error && !missingJobs(jobsCount.error))) throw new Error("Deletion counts unavailable");
    const jobsAvailable = !jobsCount.error;
    const counts = { pending: pendingCount.count ?? 0, jobs: jobsAvailable ? jobsCount.count ?? 0 : null, deleted: deletedCount.count ?? 0 };
    const total = counts[view] ?? 0;
    const base = { ...empty, counts, total, jobsAvailable, error: null };
    if (total === 0) return base;

    let gyms: Gym[] = [], jobs: Job[] = [], audits: Audit[] = [];
    if (view === "pending") {
      const result = await db.from("organizations").select(GYM_FIELDS).not("deletion_requested_at", "is", null)
        .order("deletion_requested_at", { ascending: false }).order("id").range(offset, offset + limit - 1).returns<Gym[]>();
      if (result.error) throw result.error;
      gyms = result.data ?? [];
    } else if (view === "jobs") {
      const result = await db.from("gym_deletion_jobs").select(JOB_FIELDS).order("requested_at", { ascending: false }).order("id")
        .range(offset, offset + limit - 1).returns<Job[]>();
      if (result.error) throw result.error;
      jobs = result.data ?? [];
    } else {
      const result = await db.from("admin_audit_log").select(AUDIT_FIELDS).in("action", DELETE_ACTIONS)
        .order("at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1).returns<Audit[]>();
      if (result.error) throw result.error;
      audits = result.data ?? [];
    }
    const organizationIds = [...new Set([...gyms.map(g => g.id), ...jobs.map(j => j.organization_id), ...audits.map(a => a.target_organization_id)].filter(Boolean))];
    if (!organizationIds.length) return base;
    if (view === "pending" && jobsAvailable) {
      const result = await db.from("gym_deletion_jobs").select(JOB_FIELDS).in("organization_id", organizationIds).in("state", ["quarantined", "purging"]).returns<Job[]>();
      if (result.error) throw result.error;
      jobs = result.data ?? [];
    }
    if (view !== "pending") {
      const result = await db.from("organizations").select(GYM_FIELDS).in("id", organizationIds).returns<Gym[]>();
      if (result.error) throw result.error;
      gyms = result.data ?? [];
    }
    const requestsResult = view !== "deleted" ? await db.from("admin_audit_log").select("target_organization_id,admin_id,actor_role,requested_at:new_values->>deletion_requested_at")
        .in("target_organization_id", organizationIds).in("entity_type", ["organization", "organizations"])
        .not("new_values->>deletion_requested_at", "is", null).is("old_values->>deletion_requested_at", null).order("at", { ascending: false })
        : { data: [], error: null };
    if (requestsResult.error) throw new Error("Deletion requester details unavailable");
    const requests = requestsResult.data ?? [];
    const actorIds = [...new Set([...jobs.map(j => j.requested_by), ...audits.map(a => a.admin_id), ...requests.map(a => a.admin_id)].filter((id): id is string => Boolean(id)))];
    const [staffResult, admins] = await Promise.all([
      db.from("staff_memberships").select("organization_id,user_id,first_name,last_name,email,role").in("organization_id", organizationIds)
        .or(actorIds.length ? `role.eq.owner,user_id.in.(${actorIds.join(",")})` : "role.eq.owner").order("created_at").order("id").returns<Staff[]>(),
      actorIds.length ? db.from("platform_admins").select("user_id,email").in("user_id", actorIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (staffResult.error || admins.error) throw new Error("Deletion requester details unavailable");
    const staff = staffResult.data ?? [];
    function details(organizationId: string, actorId: string | null, recordedRole?: string | null) {
      const gym = gyms.find(g => g.id === organizationId);
      const owner = staff.find(s => s.organization_id === organizationId && s.role === "owner");
      const actor = staff.find(s => s.organization_id === organizationId && s.user_id === actorId);
      const admin = admins.data?.find(a => a.user_id === actorId);
      return {
        organizationId, gymName: gym?.name ?? null, gymCode: gym?.gym_code ?? null, city: gym?.city ?? null,
        ownerName: staffName(owner), actorName: admin?.email ?? staffName(actor) ?? (!actorId && recordedRole === "system" ? "System" : null), actorRole: admin ? "platform admin" : recordedRole ?? actor?.role ?? null,
        gymExists: Boolean(gym),
      };
    }
    const jobRow = (job: Job): GymDeletionRow => {
      const request = requests.find(a => a.target_organization_id === job.organization_id && Date.parse(a.requested_at) === Date.parse(job.requested_at));
      return {
        ...details(job.organization_id, job.requested_by ?? request?.admin_id ?? null, request?.actor_role), id: job.id, requestedAt: job.requested_at, purgeAfter: job.purge_after,
        completedAt: job.completed_at, databaseDeletedAt: job.database_deleted_at, state: job.state, hasError: Boolean(job.last_error), reason: job.reason,
      };
    };
    const rows: GymDeletionRow[] = view === "jobs" ? jobs.map(jobRow) : view === "pending" ? gyms.map(gym => {
      const job = jobs.find(j => j.organization_id === gym.id);
      if (job) return jobRow(job);
      const request = requests.find(a => a.target_organization_id === gym.id && Date.parse(a.requested_at) === Date.parse(gym.deletion_requested_at!));
      return { ...details(gym.id, request?.admin_id ?? null, request?.actor_role), id: `pending:${gym.id}`, requestedAt: gym.deletion_requested_at,
        purgeAfter: null, completedAt: null, databaseDeletedAt: null, state: "legacy", hasError: false, reason: null };
    }) : audits.map(audit => ({
      ...details(audit.target_organization_id, audit.admin_id, audit.actor_role), id: `audit:${audit.id}`, gymName: audit.gym_name,
      gymCode: audit.gym_code, city: audit.city, requestedAt: audit.requested_at, purgeAfter: null, completedAt: null, databaseDeletedAt: audit.at,
      state: "database_deleted", hasError: false, reason: null,
    }));
    return { ...base, rows };
  } catch {
    return { ...empty, error: "Deletion records could not be loaded. Check this environment's database connection and server credentials, then reload this page." };
  }
}
