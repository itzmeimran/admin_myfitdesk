import { assertPermission } from "@/core/auth/access";
import { createClient } from "@/core/db/server-client";
import { loose } from "@/core/db/loose-client";
import { ButtonLink } from "@/components/ButtonLink";

type Job = { id: string; organization_id: string; requested_at: string; purge_after: string; state: string; completed_at: string | null; database_deleted_at: string | null; last_error: string | null };
function when(value: string) { return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default async function GymDeletionsPage() {
  await assertPermission("gyms.view");
  const { data, error } = await loose(await createClient()).from("gym_deletion_jobs").select("id,organization_id,requested_at,purge_after,state,completed_at,database_deleted_at,last_error").order("requested_at", { ascending: false }).limit(100);
  return <div className="flex flex-col gap-4">
    <h1 className="font-display text-xl">Gym deletions</h1>
    <p className="text-[13px] text-mute">Recovery lasts 3–7 days. Cleanup runs after the deadline and retries if any step fails. All dates are IST.</p>
    <ButtonLink href="/admin/gyms" variant="secondary">Back to gyms</ButtonLink>
    {error ? <p>Deletion history is unavailable. Check that the database update is installed.</p> : (data as Job[]).length === 0 ? <p className="text-[13px] text-mute">No scheduled gym deletions.</p> : (data as Job[]).map(job => <article key={job.id} className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-4">
      <strong className="text-[13px]">{job.state === "completed" ? "Deletion completed" : job.state === "restored" ? "Gym restored" : job.state === "purging" ? "Cleanup in progress" : "Gym isolated"}</strong>
      <p className="break-all text-[12px] text-mute">Gym ID: {job.organization_id}</p>
      <p className="text-[12px] text-mute">Requested {when(job.requested_at)} · Recovery deadline {when(job.purge_after)}{job.completed_at ? ` · Completed ${when(job.completed_at)}` : ""}</p>
      {job.last_error ? <p className="text-[12px] text-accent">Cleanup needs attention. Automatic retries remain enabled; the gym stays isolated.</p> : null}
      {job.database_deleted_at ? <p className="text-[12px] text-mute">Database records removed{job.state === "completed" ? "; file and account cleanup confirmed." : "; file or account cleanup is still pending."}</p> : job.state !== "completed" ? <ButtonLink href={`/admin/gyms/${job.organization_id}/operations?section=danger`} variant="secondary" size="sm">Open gym deletion</ButtonLink> : null}
    </article>)}
  </div>;
}
