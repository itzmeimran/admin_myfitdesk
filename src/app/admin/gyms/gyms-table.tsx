import { PendingLink } from "@/components/NavigationPending";
import { SortLink } from "@/components/SortLink";
import { EmptyState } from "@/components/EmptyState";
import type { AssignablePackage, GymListRow } from "@/features/gyms/queries";
import { pillTone } from "@/core/ui/status-style";
import { GymRowActions } from "./gym-row-actions";

export function GymStatusBadge({ status }: { status: string }) {
  const tone = status === "Active" ? { backgroundColor: "var(--sand)", color: "var(--ink)" }
    : status === "Trial" ? { backgroundColor: "color-mix(in srgb, var(--hi) 20%, var(--paper))", color: "var(--on-hi)" }
    : ["Expired", "Grace", "Suspended", "Read-only"].includes(status) ? { backgroundColor: "color-mix(in srgb, var(--accent) 9%, var(--paper))", color: "var(--accent)" }
    : pillTone(status);
  return <span className="inline-flex shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={tone}>{status}</span>;
}

function GymName({ gym, mobile = false }: { gym: GymListRow; mobile?: boolean }) {
  return <div className="min-w-0">
    <PendingLink title={gym.name} href={`/admin/gyms/${gym.organizationId}`} className={`block truncate border border-transparent font-bold hover:text-accent hover:underline focus-visible:border-accent focus-visible:outline-none ${mobile ? "text-[14px]" : "text-[12.5px]"}`}>{gym.name}</PendingLink>
    <span className="block truncate text-[11.5px] text-mute" title={gym.city}>{gym.city}</span>
    <span className="block text-[11px] text-mute">{gym.branches} {gym.branches === "1" ? "branch" : "branches"} · {gym.staff} staff</span>
  </div>;
}

function Plan({ gym }: { gym: GymListRow }) {
  return <><span className="block truncate font-semibold" title={gym.packageName}>{gym.packageName}</span><span className="block text-[11px] text-mute">{gym.period}</span></>;
}

function Members({ gym }: { gym: GymListRow }) {
  const usage = gym.usage;
  return <div className="text-[11.5px]">
    <span className={`block whitespace-nowrap font-semibold ${usage.over ? "text-accent" : ""}`}>{usage.label}</span>
    {usage.note ? <span className={`block text-[11px] ${usage.over ? "text-accent" : "text-mute"}`}>{usage.note}</span> : null}
    {usage.pct !== null ? <div role="progressbar" aria-label={`Member capacity for ${gym.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usage.pct)} aria-valuetext={`${usage.label}${usage.note ? `, ${usage.note}` : ""}`} className="mt-1.5 h-1 w-full max-w-[140px] overflow-hidden rounded bg-sand">
      <span className={`block h-full rounded ${usage.over || usage.pct >= 90 ? "bg-accent" : "bg-mute"}`} style={{ width: `${usage.pct}%` }} />
    </div> : null}
  </div>;
}

function NextDate({ gym }: { gym: GymListRow }) {
  const next = gym.nextDate;
  return <div className={`text-[11px] ${next.tone === "expired" ? "text-accent" : next.tone === "warning" ? "text-on-hi" : "text-mute"}`}>
    <span className="block whitespace-nowrap">{next.label}</span>
    <span className="block whitespace-nowrap text-[12px] font-semibold">{next.date}</span>
    <span className="block whitespace-nowrap">{next.relative}</span>
  </div>;
}

export function GymsTable({ rows, packages, searchParams, sortCol, sortDir, hasFilters }: {
  rows: GymListRow[]; packages: AssignablePackage[]; searchParams: Record<string, string | string[] | undefined>;
  sortCol: string; sortDir: "asc" | "desc"; hasFilters: boolean;
}) {
  if (!rows.length) return <div className="border border-line bg-paper"><EmptyState message={hasFilters ? "No gyms match your search or filters." : "No gyms enrolled yet."} resetHref={hasFilters ? "/admin/gyms" : undefined} /></div>;
  const headers = [
    ["name", "Gym", ""], ["owner_name", "Owner", "hidden xl:table-cell"], ["package_name", "Plan", ""], ["state", "Status", ""],
    ["member_count", "Members", ""], ["current_period_end", "Next date", ""], ["lifetime_paid_minor", "Total collected", "hidden xl:table-cell"],
  ];
  return <>
    <div className="hidden min-w-0 md:block">
      <p className="mb-1.5 text-[11px] text-mute xl:hidden">Scroll the table for next dates and actions. Owner and collection details are available on each gym.</p>
      <div role="region" aria-label="Gyms table, scroll horizontally for more columns" tabIndex={0} className="overflow-x-auto border border-line bg-paper focus-visible:border-accent focus-visible:outline-none">
        <table className="w-full min-w-[800px] table-fixed border-collapse text-[12px] xl:min-w-[1050px]">
          <caption className="sr-only">Gym subscriptions and lifetime successful collections. Select a column heading to sort.</caption>
          <colgroup><col className="w-[22%] xl:w-[18%]" /><col className="hidden xl:table-column xl:w-[16%]" /><col className="w-[20%] xl:w-[12%]" /><col className="w-[15%] xl:w-[11%]" /><col className="w-[21%] xl:w-[14%]" /><col className="w-[16%] xl:w-[12%]" /><col className="hidden xl:table-column xl:w-[12%]" /><col className="w-[6%] xl:w-[5%]" /></colgroup>
          <thead><tr className="text-left">{headers.map(([key, label, className]) => <SortLink key={key} triangle pathname="/admin/gyms" searchParams={searchParams} sortKey={key} currentSort={sortCol} currentDir={sortDir} align={key === "lifetime_paid_minor" ? "right" : "left"} className={`${className} !font-semibold !normal-case !tracking-normal !text-[11px]`}>{label}</SortLink>)}<th scope="col" className="border-b border-line px-2 py-2 text-right text-[10px] font-semibold">Actions</th></tr></thead>
          <tbody>{rows.map(gym => <tr key={gym.organizationId} className="mfd-table-row border-b border-line/60 last:border-0">
            <td className="px-3 py-3"><GymName gym={gym} /></td>
            <td className="hidden px-3 py-3 xl:table-cell"><span className="block truncate font-semibold" title={gym.ownerName}>{gym.ownerName}</span><span className="block truncate text-[11px] text-mute" title={gym.ownerEmail}>{gym.ownerEmail}</span></td>
            <td className="px-3 py-3"><Plan gym={gym} /></td>
            <td className="px-3 py-3"><GymStatusBadge status={gym.displayStatus} /></td>
            <td className="px-3 py-3"><Members gym={gym} /></td>
            <td className="px-3 py-3"><NextDate gym={gym} /></td>
            <td className="hidden whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums xl:table-cell">{gym.ltv}</td>
            <td className="px-2 py-3 text-right"><GymRowActions gym={gym} packages={packages} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <div className="flex flex-col gap-3 md:hidden">{rows.map(gym => <article key={gym.organizationId} aria-label={gym.name} className="min-w-0 border border-line bg-paper p-3.5">
      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><GymName gym={gym} mobile /></div><GymStatusBadge status={gym.displayStatus} /><GymRowActions gym={gym} packages={packages} /></div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-line/60 pt-3 text-[12px]">
        <div className="min-w-0"><span className="mb-1 block text-[10px] text-mute">Plan</span><Plan gym={gym} /></div>
        <div><span className="mb-1 block text-[10px] text-mute">Members</span><Members gym={gym} /></div>
        <NextDate gym={gym} />
        <div className="text-right"><span className="block text-[11px] text-mute">Total collected</span><span className="font-semibold tabular-nums">{gym.ltv}</span></div>
      </div>
    </article>)}</div>
  </>;
}
