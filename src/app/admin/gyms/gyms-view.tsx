"use client";

import { useMemo, useState } from "react";
import type { Gym, GymFilter } from "@/features/gyms/mock-data";
import { GYM_FILTERS } from "@/features/gyms/mock-data";
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

/**
 * Filter chips and the search box are both real client-side state applied
 * to the list — the design mockup tracked `filter` but never applied it
 * (design-audit.md's cross-page notes); wiring it is trivial against a
 * static array, so it's wired for real here rather than left cosmetic.
 * Export CSV, Invite gym owner, and pagination are visual-only in the
 * design with no handler — left disabled/inert per that same audit rather
 * than inventing behavior the design never specified.
 */
export function GymsView({ gyms, initialFilter }: { gyms: Gym[]; initialFilter: GymFilter }) {
  const [filter, setFilter] = useState<GymFilter>(initialFilter);
  const [search, setSearch] = useState("");

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
          {/* TODO(real-data): count(organizations), count(branches), count(members) — see design-audit.md's Data mapping section. */}
          <p className="text-[12.5px] text-mute">128 enrolled · 214 branches · 41,382 members across the platform</p>
        </div>
        <button
          type="button"
          disabled
          title="Not implemented yet"
          className="flex min-h-[36px] items-center gap-2 border-[1.5px] border-line bg-paper px-3 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-not-allowed disabled:opacity-60"
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
              {["Gym / owner", "Package", "Status", "Member usage", "Br / staff", "Renews", "Paid to date"].map(
                (h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`mfd-micro-label border-b border-line px-4 py-2.5 ${i >= 4 ? "text-right" : ""}`}
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
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11.5px] text-mute">
          <span>
            Showing {filtered.length} of 128 gyms
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
    </div>
  );
}
