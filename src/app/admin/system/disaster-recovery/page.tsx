import Link from "next/link";
import { getDisasterRecoveryData } from "@/features/disaster-recovery/queries";
import { DisasterRecoveryView } from "@/features/disaster-recovery/DisasterRecoveryView";
import { createClient } from "@/core/db/server-client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `?org=<organization_id>` (linked from a gym's Operations tab) scopes the
 * per-record part of Recovery — the soft-deleted records list — to that gym.
 * Backups themselves are whole-database and stay unscoped; restore actions
 * are unchanged and still live only here.
 */
export default async function DisasterRecoveryPage({ searchParams }: { searchParams: Promise<{ org?: string | string[] }> }) {
  const raw = (await searchParams).org;
  const organizationId = typeof raw === "string" && UUID.test(raw) ? raw : null;

  const [data, gymName] = await Promise.all([
    getDisasterRecoveryData(organizationId),
    organizationId
      ? (async () => {
          const supabase = await createClient();
          const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
          return org?.name ?? null;
        })()
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {organizationId ? (
        <div className="flex flex-wrap items-center gap-3 border-[1.5px] border-ink bg-sand/60 px-4 py-3 text-[12.5px]">
          <span>
            Recovery opened for <strong>{gymName ?? "this gym"}</strong>. Backups below are for the whole platform database; the soft-deleted
            records list is limited to this gym.
          </span>
          <span className="ml-auto flex gap-3 text-[11px] font-bold uppercase tracking-[0.08em]">
            <Link href={`/admin/gyms/${organizationId}/operations?section=data`} className="text-mute hover:text-ink">
              ← Back to gym
            </Link>
            <Link href="/admin/system/disaster-recovery" className="text-accent">
              Show all
            </Link>
          </span>
        </div>
      ) : null}
      <DisasterRecoveryView data={data} />
    </div>
  );
}
