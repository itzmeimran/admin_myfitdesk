import { ButtonLink } from "@/components/ButtonLink";
import { Pagination, parsePagination } from "@/components/Pagination";
import { deletionDisplay } from "@/features/gyms/deletion-display";
import { getGymDeletions, type DeletionView } from "./_server/queries";

const PATH = "/admin/gyms/deletions";
const VIEWS = [
  { key: "pending", label: "Pending requests" },
  { key: "jobs", label: "Cleanup history" },
  { key: "deleted", label: "Database deletions" },
] as const;
function when(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function GymDeletionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const view: DeletionView = sp.view === "jobs" || sp.view === "deleted" ? sp.view : "pending";
  const { page, pageSize, offset } = parsePagination(sp);
  const result = await getGymDeletions({ view, limit: pageSize, offset });
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-xl">Gym deletions</h1>
        <p className="mt-1 text-[13px] text-mute">Pending requests, automatic cleanup and earlier database deletions. All dates are IST.</p>
      </div>
      <ButtonLink href="/admin/gyms" variant="secondary">Back to gyms</ButtonLink>
    </div>
    {result.error ? <p role="alert" className="border border-line bg-paper p-4 text-[13px] text-accent">{result.error}</p> : <>
      <nav aria-label="Deletion records" className="flex flex-wrap gap-2">
        {VIEWS.map(item => <ButtonLink key={item.key} href={`${PATH}?view=${item.key}&pageSize=${pageSize}`} selected={view === item.key} variant="secondary" size="sm">
          {item.label} · {result.counts[item.key] ?? "Unavailable"}
        </ButtonLink>)}
      </nav>
      <p className="text-[12px] text-mute">{view === "pending"
        ? "These gyms still have a deletion request and their database records are available. Earlier requests without a cleanup job have no automatic deadline."
        : view === "jobs"
          ? "Tracks scheduled requests, cleanup in progress, completed cleanup and restored gyms. A completion receipt remains after the gym data is removed."
          : "Includes earlier gym deletions recorded in the audit log. These confirm database deletion; file and login-account cleanup was not recorded for those earlier deletions. Completed automatic cleanup also appears in Cleanup history."}</p>
      {!result.jobsAvailable ? <p role="status" className="border border-line p-3 text-[12px] text-mute">Scheduled cleanup tracking is unavailable in this environment. Pending gym requests and recorded database deletions are still shown.</p> : null}
      {result.rows.length === 0 ? <p className="border border-line bg-paper p-4 text-[13px] text-mute">{view === "jobs" && !result.jobsAvailable ? "Cleanup history could not be loaded." : result.total > 0 ? "No records on this page. Use the pagination controls to return to an earlier page." : view === "pending" ? "No gyms are currently pending deletion." : view === "jobs" ? "No scheduled cleanup records." : "No gym database deletions were found in the audit log."}</p> : result.rows.map(row => {
        const display = deletionDisplay(row);
        return <article key={row.id} className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-[15px] font-bold">{row.gymName ?? "Gym name no longer retained"}</h2>
              <p className="text-[12px] text-mute">{[row.gymCode, row.city].filter(Boolean).join(" · ")}</p></div>
            <strong className="text-[12px] text-accent">{display.label}</strong>
          </div>
          <p className="break-all text-[11px] text-mute">Gym ID: {row.organizationId}</p>
          {row.ownerName ? <p className="text-[12px]">Owner: {row.ownerName}</p> : null}
          <p className="text-[12px]">{view === "deleted" ? "Deleted by" : "Requested by"}: {row.actorName ?? "Not recorded or no longer retained"}{row.actorRole ? ` (${row.actorRole.replaceAll("_", " ")})` : ""}</p>
          <p className="text-[12px] text-mute">{row.requestedAt ? `Requested ${when(row.requestedAt)}` : "Request date not recorded"}{row.purgeAfter ? ` · Recovery deadline ${when(row.purgeAfter)}` : ""}{row.completedAt ? ` · Cleanup completed ${when(row.completedAt)}` : ""}{row.databaseDeletedAt ? ` · Database deleted ${when(row.databaseDeletedAt)}` : ""}</p>
          {row.reason ? <p className="whitespace-pre-wrap text-[12px]">Reason: {row.reason}</p> : null}
          <p className="text-[12px] text-mute">{display.description}</p>
          {row.gymExists ? <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/gyms/${row.organizationId}`} variant="secondary" size="sm">View gym data</ButtonLink>
            {["legacy", "quarantined", "purging"].includes(row.state) ? <ButtonLink href={`/admin/gyms/${row.organizationId}/operations?section=danger`} variant="secondary" size="sm">Manage deletion</ButtonLink> : null}
          </div> : null}
        </article>;
      })}
      <Pagination pathname={PATH} searchParams={sp} page={page} pageSize={pageSize} total={result.total} itemLabel="deletion records" />
    </>}
  </div>;
}
