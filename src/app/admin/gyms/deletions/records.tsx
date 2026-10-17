import { ButtonLink } from "@/components/ButtonLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { ClockIcon, DatabaseIcon, GymsIcon, ListIcon, ManageIcon, ProtectIcon, UploadIcon } from "@/core/ui/icons";
import { deletionDisplay, deletionStages } from "@/features/gyms/deletion-display";
import { getGymDeletions, type DeletionView } from "./_server/queries";
import { CleanupInspectionControl } from "./cleanup-inspection";

const PATH = "/admin/gyms/deletions";
const VIEWS = [
  { key: "pending", label: "Pending requests", icon: ClockIcon },
  { key: "jobs", label: "Cleanup history", icon: ListIcon },
  { key: "deleted", label: "Database deletions", icon: DatabaseIcon },
] as const;
function when(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export async function DeletionRecords({ view, searchParams: sp }: { view: DeletionView; searchParams: Record<string, string | string[] | undefined> }) {
  const { page, pageSize, offset } = parsePagination(sp);
  const result = await getGymDeletions({ view, limit: pageSize, offset });
  return <>
    {result.error ? <p role="alert" className="border border-line bg-paper p-4 text-[13px] text-accent">{result.error}</p> : <>
      <nav aria-label="Deletion records" className="flex flex-wrap gap-2">
        {VIEWS.map(item => <ButtonLink key={item.key} icon={item.icon} href={`${PATH}?view=${item.key}&pageSize=${pageSize}`} selected={view === item.key} variant="secondary" size="sm">
          {item.label} · {result.counts[item.key] ?? "Unavailable"}
        </ButtonLink>)}
      </nav>
      <p className="text-[12px] text-mute">{view === "pending"
        ? "These gyms still have a deletion request and their database records are available. Earlier requests without a cleanup job have no automatic deadline."
        : view === "jobs"
          ? "Tracks scheduled requests, cleanup in progress, completed cleanup and restored gyms. A completion receipt remains after the gym data is removed."
          : "Historical database deletion events, counted separately from automatic cleanup receipts in Cleanup history. These are records of past actions, not a count of current gyms. Compare gym IDs: names and codes can be reused. Each cleanup stage below shows its evidence; use Inspect cleanup now for a read-only check of current storage and recoverable account IDs."}</p>
      {!result.jobsAvailable ? <p role="status" className="border border-line p-3 text-[12px] text-mute">Scheduled cleanup tracking is unavailable in this environment. Pending gym requests and recorded database deletions are still shown.</p> : null}
      {result.rows.length === 0 ? <p className="border border-line bg-paper p-4 text-[13px] text-mute">{view === "jobs" && !result.jobsAvailable ? "Cleanup history could not be loaded." : result.total > 0 ? "No records on this page. Use the pagination controls to return to an earlier page." : view === "pending" ? "No gyms are currently pending deletion." : view === "jobs" ? "No scheduled cleanup records." : "No gym database deletions were found in the audit log."}</p> : result.rows.map(row => {
        const display = deletionDisplay(row);
        return <article key={row.id} className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-[15px] font-bold">{row.gymName ?? "Gym name no longer retained"}</h2>
              <p className="text-[12px] text-mute">{[row.gymCode, row.city].filter(Boolean).join(" · ")}</p></div>
            <strong className="text-[12px] text-accent">{display.label}</strong>
          </div>
          <p className="break-all text-[11px] text-mute">{view === "deleted" ? "Historical gym ID" : "Gym ID"}: {row.organizationId}</p>
          {row.gymCreatedAt ? <p className="text-[12px] text-mute">Gym record created {when(row.gymCreatedAt)} IST</p> : null}
          {row.ownerName ? <p className="text-[12px]">Owner: {row.ownerName}</p> : null}
          <p className="text-[12px]">{view === "deleted" ? "Deletion recorded by" : "Requested by"}: {row.actorName ?? "Not recorded or no longer retained"}{row.actorRole ? ` (${row.actorRole.replaceAll("_", " ")})` : ""}</p>
          <p className="text-[12px] text-mute">{row.requestedAt ? `Requested ${when(row.requestedAt)} IST` : "Request date not recorded"}{row.purgeAfter ? ` · Recovery deadline ${when(row.purgeAfter)} IST` : ""}{row.completedAt ? ` · Cleanup completed ${when(row.completedAt)} IST` : ""}{row.databaseDeletedAt ? ` · Database deletion recorded ${when(row.databaseDeletedAt)} IST` : ""}{row.attempts !== undefined ? ` · Worker attempts: ${row.attempts}` : ""}</p>
          {row.reason ? <p className="whitespace-pre-wrap text-[12px]">Reason: {row.reason}</p> : null}
          {row.cleanupError ? <p className="whitespace-pre-wrap text-[12px] text-accent">Last cleanup error: {row.cleanupError}</p> : null}
          <p className="text-[12px] text-mute">{display.description}</p>
          {row.otherGymsWithSameCode?.map(gym => <div key={gym.organizationId} className="flex flex-col gap-2 border-[1.5px] border-line bg-sand p-3 text-[12px]">
            <strong>A different current gym uses this code: {gym.name}</strong>
            <p>This current record was created {when(gym.createdAt)} IST. This historical deletion does not apply to its gym ID.</p>
            <p className="break-all text-[11px] text-mute">Current gym ID: {gym.organizationId}</p>
            <div><ButtonLink icon={GymsIcon} href={`/admin/gyms/${gym.organizationId}`} variant="secondary" size="sm">View current gym</ButtonLink></div>
          </div>)}
          <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-3">
            {deletionStages(row).map(stage => {
              const Icon = stage.key === "database" ? DatabaseIcon : stage.key === "files" ? UploadIcon : ProtectIcon;
              return <div key={stage.key} className="flex flex-col gap-1 text-[12px]">
                <strong className="flex items-center gap-2"><Icon size={14} aria-hidden />{stage.label}</strong>
                <span className="font-semibold">{stage.status}</span>
                <p className="text-mute">{stage.detail}</p>
              </div>;
            })}
          </div>
          {row.databaseDeletedAt ? <CleanupInspectionControl organizationId={row.organizationId} /> : null}
          {row.gymExists ? <div className="flex flex-wrap gap-2">
            <ButtonLink icon={GymsIcon} href={`/admin/gyms/${row.organizationId}`} variant="secondary" size="sm">View gym data</ButtonLink>
            {["legacy", "quarantined", "purging"].includes(row.state) ? <ButtonLink icon={ManageIcon} href={`/admin/gyms/${row.organizationId}/operations?section=danger`} variant="secondary" size="sm">Manage deletion</ButtonLink> : null}
          </div> : null}
        </article>;
      })}
      <Pagination pathname={PATH} searchParams={sp} page={page} pageSize={pageSize} total={result.total} itemLabel="deletion records" />
    </>}
  </>;
}
