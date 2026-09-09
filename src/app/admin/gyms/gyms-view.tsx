"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Gym, GymFilter } from "@/features/gyms/mock-data";
import { GYM_FILTERS } from "@/features/gyms/mock-data";
import type { AssignablePackage, GymsSummary } from "@/features/gyms/queries";
import {
  extendSubscription,
  changeSubscriptionPackage,
  cancelSubscription,
  restoreSubscription,
} from "@/features/gyms/actions";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { downloadCsv } from "@/core/csv";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import {
  ExportIcon,
  InviteIcon,
  SearchIcon,
  ListIcon,
  CalendarCheckIcon,
  TrialsIcon,
  AlertIcon,
  ReadOnlyIcon,
  PrevPageIcon,
  NextPageIcon,
  LoadMoreIcon,
  ManageIcon,
  ExtendIcon,
  PackagesIcon,
  ArchiveIcon,
  RestoreIcon,
  type IconType,
} from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

const FILTER_ICON: Record<GymFilter, IconType> = {
  All: ListIcon,
  Active: CalendarCheckIcon,
  Trialing: TrialsIcon,
  Grace: AlertIcon,
  "Read-only": ReadOnlyIcon,
};

const ACCENT = "var(--accent)";
const INK = "var(--ink)";
const MUTE = "var(--mute)";

function usageTone(pct: number) {
  return pct >= 90 ? ACCENT : INK;
}
function renewTone(renews: string) {
  return renews.startsWith("Overdue") || renews.startsWith("Trial") ? ACCENT : MUTE;
}

const CSV_HEADERS = [
  "Gym",
  "Owner",
  "City",
  "Package",
  "Billing period",
  "Status",
  "Members",
  "Member cap",
  "Branches",
  "Staff",
  "Renews",
  "Lifetime paid",
];

function gymToCsvRow(g: Gym): string[] {
  return [g.name, g.owner, g.city, g.package, g.period, g.status, g.members, g.cap, g.branches, g.staff, g.renews, g.ltv];
}

/**
 * Filter chips and the search box are both real client-side state applied
 * to the list — the design mockup tracked `filter` but never applied it
 * (design-audit.md's cross-page notes); wiring it is trivial against a
 * static array, so it's wired for real here rather than left cosmetic.
 * Export CSV (CLAUDE.md's Plan, P2 #9 — the one Gyms placeholder the
 * product owner chose to build) exports exactly the rows the table
 * currently shows, i.e. respects the active filter/search — never a
 * silent "export everything" behind a "export what you see" label.
 * Invite gym owner and pagination/Load more stay inert placeholders,
 * deliberately deferred (P2 #9): Invite needs new infra (email sending,
 * an invite-token flow) beyond this pass's scope, and pagination has
 * nothing real to page through yet (4 gyms on the live project).
 */
export function GymsView({
  gyms,
  packages,
  summary,
  initialFilter,
}: {
  gyms: Gym[];
  packages: AssignablePackage[];
  summary: GymsSummary;
  initialFilter: GymFilter;
}) {
  const [filter, setFilter] = useState<GymFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<Gym | null>(null);
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gyms.filter((g) => {
      if (filter !== "All" && g.status !== filter) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.owner.toLowerCase().includes(q) ||
        g.city.toLowerCase().includes(q)
      );
    });
  }, [gyms, filter, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Gyms</h1>
          <p className="text-[12.5px] text-mute">
            {summary.enrolledCount.toLocaleString("en-IN")} enrolled ·{" "}
            {summary.branchCount.toLocaleString("en-IN")} branches ·{" "}
            {summary.memberCount.toLocaleString("en-IN")} members across the platform
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (filtered.length === 0) {
              toast.error("No gyms to export.");
              return;
            }
            downloadCsv("gyms.csv", CSV_HEADERS, filtered.map(gymToCsvRow));
          }}
          className="flex min-h-[36px] items-center gap-2 border-[1.5px] border-line bg-paper px-3 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
        >
          <ExportIcon size={ICON_SIZE.button} aria-hidden />
          Export CSV
        </button>
        <button
          type="button"
          disabled
          title="Not implemented yet"
          className="flex min-h-[36px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-not-allowed disabled:opacity-60"
        >
          <InviteIcon size={ICON_SIZE.button} aria-hidden />
          Invite gym owner
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[36px] flex-1 items-center gap-2 border-[1.5px] border-line bg-paper px-3" style={{ minWidth: 220 }}>
          <SearchIcon size={15} className="text-mute2" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search gym, owner or city"
            className="w-full border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-mute2"
          />
        </label>
        <div className="flex flex-wrap" role="group" aria-label="Filter by status">
          {GYM_FILTERS.map((f) => {
            const Icon = FILTER_ICON[f];
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={`-ml-[1.5px] flex min-h-[34px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11px] font-bold first:ml-0 ${
                  on ? "bg-ink text-hi" : "bg-paper text-ink"
                }`}
              >
                <Icon size={13} aria-hidden />
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto border-[1.5px] border-ink bg-paper md:block">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left">
              {["Gym / owner", "Package", "Status", "Member usage", "Br / staff", "Renews", "Paid to date", ""].map(
                (h, i) => (
                  <th
                    key={h || "actions"}
                    scope="col"
                    className={`mfd-micro-label border-b border-line px-4 py-2.5 ${i >= 4 && i < 7 ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.name} className="mfd-table-row">
                <td className="max-w-[230px] border-b border-line px-4 py-2.5">
                  <span className="block truncate font-bold">{g.name}</span>
                  <span className="block truncate text-[11px] text-mute2">
                    {g.owner} · {g.city}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5">
                  <span className="block font-bold">{g.package}</span>
                  <span className="block text-[11px] text-mute2">{g.period}</span>
                </td>
                <td className="border-b border-line px-3 py-2.5">
                  <span className={PILL_CLASS} style={pillTone(g.status)}>
                    {g.status}
                  </span>
                </td>
                <td className="border-b border-line px-3 py-2.5" style={{ minWidth: 130 }}>
                  <span className="block text-[11.5px] font-bold" style={{ color: usageTone(g.pct) }}>
                    {g.members} / {g.cap}
                  </span>
                  <span className="mt-1 block h-[6px] w-full bg-sand">
                    <span
                      className="block h-[6px]"
                      style={{ width: `${Math.min(g.pct, 100)}%`, background: usageTone(g.pct) }}
                    />
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right">
                  {g.branches} / {g.staff}
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right" style={{ color: renewTone(g.renews) }}>
                  {g.renews}
                </td>
                <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-right font-bold">
                  {g.ltv}
                </td>
                <td className="whitespace-nowrap border-b border-line px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setManaging(g)}
                    className="inline-flex min-h-[30px] items-center gap-1.5 border-[1.5px] border-line px-2.5 text-[11px] font-bold text-ink"
                  >
                    <ManageIcon size={13} aria-hidden />
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11.5px] text-mute">
          <span>
            Showing {filtered.length} of {summary.enrolledCount} gyms
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              title="Not implemented yet"
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center border-[1.5px] border-line text-mute3"
            >
              <PrevPageIcon size={14} aria-hidden />
            </button>
            <button
              type="button"
              disabled
              title="Not implemented yet"
              className="flex h-8 w-8 items-center justify-center border-[1.5px] border-line text-ink opacity-60"
            >
              <NextPageIcon size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile / tablet card list */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {filtered.map((g) => (
          <div key={g.name} className="flex flex-col gap-2 border-[1.5px] border-line bg-paper p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{g.name}</span>
                <span className="block truncate text-[11.5px] text-mute2">
                  {g.owner} · {g.city}
                </span>
              </div>
              <span className={`${PILL_CLASS} flex-shrink-0`} style={pillTone(g.status)}>
                {g.status}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold" style={{ color: usageTone(g.pct) }}>
                {g.members} / {g.cap} · {g.pct}%
              </span>
              <span className="h-[8px] flex-1 bg-sand">
                <span
                  className="block h-[8px]"
                  style={{ width: `${Math.min(g.pct, 100)}%`, background: usageTone(g.pct) }}
                />
              </span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-mute">
              {g.package} · {g.period}
              <br />
              {g.branches} branches · {g.staff} staff
              <br />
              <span style={{ color: renewTone(g.renews) }}>Renews {g.renews}</span> · Paid {g.ltv}
            </p>
            <button
              type="button"
              onClick={() => setManaging(g)}
              className="flex min-h-[40px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink"
            >
              <ManageIcon size={13} aria-hidden />
              Manage subscription
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled
          title="Not implemented yet"
          className="flex min-h-[44px] items-center justify-center gap-2 border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LoadMoreIcon size={ICON_SIZE.button} aria-hidden />
          Load more gyms
        </button>
      </div>

      <ManageSubscriptionSheet
        key={managing?.organizationId ?? "none"}
        gym={managing}
        packages={packages}
        onClose={() => setManaging(null)}
      />
    </div>
  );
}

/**
 * Extend / change package / cancel-restore — the three write actions
 * organization_subscriptions now has RPCs for (supabase/migrations/1004_
 * admin_subscription_write_rpcs.sql). Each is its own immediate action
 * (own pending state, own button) rather than one combined form, matching
 * how packages-view.tsx treats Archive/Restore as a single-field action
 * separate from the multi-field Edit form.
 */
function ManageSubscriptionSheet({
  gym,
  packages,
  onClose,
}: {
  gym: Gym | null;
  packages: AssignablePackage[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"extend" | "package" | "lifecycle" | null>(null);
  const [days, setDays] = useState("7");
  // Pre-select the gym's current package, if it's still an assignable
  // (active) tier — the parent keys this component by organizationId, so a
  // fresh mount (and fresh initializer run) happens each time a different
  // gym is opened.
  const [packageId, setPackageId] = useState(() =>
    gym && gym.packageId && packages.some((p) => p.id === gym.packageId) ? gym.packageId : "",
  );

  if (!gym) return null;

  const isCancelled = gym.status === "Cancelled";

  function run(kind: "extend" | "package" | "lifecycle", action: () => Promise<{ error: string | null }>) {
    setBusy(kind);
    startTransition(async () => {
      const { error } = await action();
      setBusy(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Subscription updated.");
      router.refresh();
    });
  }

  return (
    <Sheet
      open={!!gym}
      onClose={onClose}
      eyebrow="Writes to organization_subscriptions"
      title={`Manage ${gym.name}`}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[11.5px] leading-relaxed text-mute">
          {gym.package} · {gym.period} · Renews {gym.renews}
        </p>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Extend</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[11.5px] text-mute">days from today (or from the current renewal date, if later)</span>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const n = Number(days);
              if (!Number.isInteger(n) || n <= 0) {
                toast.error("Days must be a positive whole number.");
                return;
              }
              run("extend", () => extendSubscription(gym.organizationId, n));
            }}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-ink bg-ink text-[11px] font-bold uppercase tracking-[0.09em] text-hi disabled:cursor-wait disabled:opacity-70"
          >
            <ExtendIcon size={13} aria-hidden />
            {busy === "extend" ? "Extending…" : "Extend subscription"}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Change package</span>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="" disabled>
              Select a package
            </option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.billingPeriod === "yearly" ? "Yearly" : "Monthly"} · {p.price}
              </option>
            ))}
          </select>
          <p className="text-[10.5px] text-mute3">
            Takes effect immediately at the existing renewal date — this doesn&apos;t prorate or move the date.
          </p>
          <button
            type="button"
            disabled={isPending || !packageId}
            onClick={() => run("package", () => changeSubscriptionPackage(gym.organizationId, packageId))}
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
          >
            <PackagesIcon size={13} aria-hidden />
            {busy === "package" ? "Changing…" : "Change package"}
          </button>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            {isCancelled ? "Reactivate" : "Cancel"}
          </span>
          <p className="text-[10.5px] text-mute3">
            {isCancelled
              ? "Restores billing status without changing the renewal date — Extend separately if they should get access back today."
              : "Ends auto-renew immediately. The gym keeps whatever access its dates already say (grace/read-only rules still apply)."}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run("lifecycle", () =>
                isCancelled ? restoreSubscription(gym.organizationId) : cancelSubscription(gym.organizationId),
              )
            }
            className="flex min-h-[38px] items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {isCancelled ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
            {busy === "lifecycle" ? "Working…" : isCancelled ? "Restore subscription" : "Cancel subscription"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
