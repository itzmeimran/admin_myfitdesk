"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuListFilter, LuSearch, LuX } from "react-icons/lu";
import { countActiveFilters, flagOf } from "@/features/sales/derive";
import {
  BOARD_COLUMNS, LEAD_SOURCES, STAGE_LABEL, columnOf, type BoardColumn, type Lead, type LeadFilters,
} from "@/features/sales/model";
import { useSalesCrm } from "@/features/sales/use-sales-crm";
import { useVisibleLeads } from "@/features/sales/use-visible-leads";
import { OwnerBadge, TileStrip } from "./crm-ui";
import { AlertIcon, CancelIcon, CrmIcon } from '@/core/ui/icons';

const FILTER_CHIPS: { key: keyof LeadFilters; label: string; fmt?: (v: string, users: Record<string, { name: string }>) => string }[] = [
  { key: "owner", label: "Salesperson", fmt: (v, u) => u[v]?.name ?? v },
  { key: "stage", label: "Stage", fmt: (v) => STAGE_LABEL[v as keyof typeof STAGE_LABEL] ?? v },
  { key: "source", label: "Source" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "area", label: "Area" },
  { key: "pin", label: "PIN" },
  { key: "priority", label: "Priority", fmt: () => "High" },
  { key: "followUp", label: "Follow-up", fmt: (v) => ({ overdue: "Overdue", today: "Due today", upcoming: "Upcoming", none: "None" })[v] ?? v },
  { key: "demo", label: "Demo", fmt: (v) => v[0].toUpperCase() + v.slice(1) },
  { key: "trial", label: "Trial", fmt: (v) => (v === "active" ? "Active" : "Ending soon") },
  { key: "range", label: "Created", fmt: (v) => `Last ${v} days` },
];

export function PipelineView() {
  const crm = useSalesCrm();
  const { shown } = useVisibleLeads();
  const filterCount = countActiveFilters(crm.filters);
  const chips = FILTER_CHIPS.filter((c) => crm.filters[c.key]);

  const visibleUsers = Object.values(crm.users).filter((u) => crm.role === "admin" || u.team === crm.me.team);
  const cities = [...new Set(crm.leads.map((l) => l.city))].sort();
  const inline: { key: "owner" | "source" | "city"; label: string; options: { value: string; label: string }[] }[] = [
    ...(crm.role !== "rep" ? [{ key: "owner" as const, label: "Salesperson", options: visibleUsers.map((u) => ({ value: u.id, label: u.name })) }] : []),
    { key: "source", label: "Source", options: LEAD_SOURCES.map((v) => ({ value: v, label: v })) },
    { key: "city", label: "City", options: cities.map((v) => ({ value: v, label: v })) },
  ];

  const mobileIdx = Math.min(crm.mobileStage, BOARD_COLUMNS.length - 1);
  const mobileCol = BOARD_COLUMNS[mobileIdx];
  const countIn = (key: BoardColumn) => shown.filter((l) => columnOf(l.stage) === key).length;
  const [dragOver, setDragOver] = useState<BoardColumn | null>(null);

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <TileStrip tiles={[{label:"Total leads",value:crm.summary.total,tone:"ink"},{label:"New",value:crm.summary.new,tone:"ink"},{label:"Follow-ups due",value:crm.summary.due,tone:crm.summary.overdue?"rust":"ink"},{label:"Demos scheduled",value:crm.summary.demos,tone:"ink"},{label:"Active trials",value:crm.summary.trials,tone:"ink"},{label:"Converted",value:crm.summary.converted,tone:"ink"},{label:"Conversion",value:crm.summary.total?`${Math.round(crm.summary.converted/crm.summary.total*100)}%`:"—",tone:"ink"}].map((t) => ({ label: t.label, value: t.value, rust: t.tone === "rust" }))} cols="grid-cols-3 md:grid-cols-4 lg:grid-cols-7" />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] min-w-0 flex-1 basis-[220px] items-center gap-2 border-[1.5px] border-line bg-paper px-2.5 md:min-h-[36px] md:max-w-[300px]">
          <LuSearch size={15} className="flex-shrink-0 text-mute2" aria-hidden />
          <span className="sr-only">Search leads</span>
          <input
            type="search"
            value={crm.query}
            onChange={(e) => crm.setQuery(e.target.value)}
            placeholder="Gym, contact, phone or email"
            className="w-full min-w-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-[#a99d91] md:text-[13px]"
          />
        </label>

        <div className="hidden gap-2 lg:flex">
          {inline.map((f) => (
            <Dropdown
              key={f.key}
              ariaLabel={f.label}
              size="sm"
              className="max-w-[150px]"
              value={crm.filters[f.key]}
              onChange={(v) => crm.patchFilters({ [f.key]: v })}
              options={[{ value: "", label: `${f.label}: All` }, ...f.options]}
            />
          ))}
        </div>

        <Button icon={LuListFilter} type="button" variant="secondary" layout="control" size="custom" onClick={() => crm.openModal({ kind: "filters" })}
          className="min-h-[44px] gap-2 border-[1.5px] border-ink bg-paper px-3 text-[12px] font-bold text-ink hover:bg-sand md:min-h-[36px]">

          <span className="hidden lg:inline">All filters</span>
          <span className="lg:hidden">Filters</span>
          {filterCount ? <span>· {filterCount}</span> : null}
        </Button>

        <Button icon={AlertIcon} type="button" variant="secondary" layout="control" size="custom" aria-pressed={crm.attentionOnly} onClick={() => crm.setAttentionOnly(!crm.attentionOnly)}
          className={`min-h-[44px] gap-2 border-[1.5px] border-ink px-3 text-[12px] font-bold md:min-h-[36px] ${crm.attentionOnly ? "bg-ink text-hi" : "bg-paper text-ink hover:bg-sand"}`}>
          <span aria-hidden className="h-2 w-2 border-[1.5px] border-ink bg-hi" />
          Needs attention · {crm.attentionCount}
        </Button>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Button icon={LuX} key={c.key} type="button" variant="secondary" layout="control" size="custom" aria-label={`Remove filter ${c.label}`} onClick={() => crm.patchFilters({ [c.key]: "" })}
              className="min-h-[30px] gap-1.5 border-[1.5px] border-line bg-sand pl-2.5 pr-2 text-[12px] font-medium text-ink hover:border-ink">
              {c.label}: {c.fmt ? c.fmt(crm.filters[c.key], crm.users) : crm.filters[c.key]}

            </Button>
          ))}
          <Button type="button" variant="text" size="custom" onClick={crm.clearFilters} className="min-h-[30px] px-1.5 text-[12px] font-bold text-accent">
            Clear all
          </Button>
        </div>
      ) : null}

      {/* Phone: one stage at a time, switched with arrows or the stage list. */}
      <div className="flex gap-1.5 md:hidden">
        <Button icon={LuChevronLeft} type="button" variant="secondary" layout="content" aria-label="Previous stage" onClick={() => crm.setMobileStage((mobileIdx + BOARD_COLUMNS.length - 1) % BOARD_COLUMNS.length)}
          className="min-h-[48px] w-12 flex-shrink-0 items-center justify-center border-[1.5px] border-line bg-paper text-ink" />
        <Button icon={LuChevronDown} type="button" variant="secondary" layout="content" aria-haspopup="dialog" onClick={() => crm.openModal({ kind: "stages" })}
          className="min-h-[48px] min-w-0 flex-1 items-center gap-2.5 border-[1.5px] border-ink bg-paper px-3.5 text-left">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-[9.5px] font-bold normal-case tracking-[0.12em] text-mute2">Stage {mobileIdx + 1} of {BOARD_COLUMNS.length}</span>
            <span className="text-[15px] font-bold">{mobileCol.label}</span>
          </span>
          <span className="flex h-6 min-w-6 items-center justify-center bg-ink px-1.5 text-[12px] font-bold text-hi">{countIn(mobileCol.key)}</span>

        </Button>
        <Button icon={LuChevronRight} type="button" variant="secondary" layout="content" aria-label="Next stage" onClick={() => crm.setMobileStage((mobileIdx + 1) % BOARD_COLUMNS.length)}
          className="min-h-[48px] w-12 flex-shrink-0 items-center justify-center border-[1.5px] border-line bg-paper text-ink" />
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 border-[1.5px] border-dashed border-line px-5 py-10 text-center">
          <span className="text-[15px] font-bold">No leads match</span>
          <span className="text-[13px] text-mute">Try a different search or remove a filter.</span>
          <Button icon={CancelIcon} type="button" variant="secondary" size="md" onClick={crm.clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col items-start gap-2.5 pb-2 md:snap-x md:snap-mandatory md:flex-row md:overflow-x-auto lg:snap-none">
          {BOARD_COLUMNS.map((col, idx) => {
            const cards = shown.filter((l) => columnOf(l.stage) === col.key);
            const onThisPhone = idx === mobileIdx;
            return (
              <section
                key={col.key}
                aria-label={`${col.label}, ${cards.length} leads`}
                onDragOver={(e) => { e.preventDefault(); if (dragOver !== col.key) setDragOver(col.key); }}
                onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) crm.commands.moveLead(id, col.key);
                }}
                className={`${onThisPhone ? "flex" : "hidden"} w-full flex-col gap-2 bg-transparent md:flex md:w-[300px] md:flex-shrink-0 md:snap-start md:bg-sand md:p-2.5 lg:w-[272px] ${dragOver === col.key ? "outline-2 -outline-offset-2 outline-dashed outline-ink" : ""}`}
              >
                <header className="hidden items-baseline gap-2 px-0.5 pb-1 pt-0.5 md:flex">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.12em]">{col.label}</h2>
                  <span className="text-[12px] font-bold text-mute2">{cards.length}</span>
                  {col.key === "closed" ? <span className="ml-auto text-[10.5px] text-mute2">Later · Not interested · Lost</span> : null}
                </header>
                {cards.length === 0 ? (
                  <div className="border-[1.5px] border-dashed border-[#d9cebf] px-2.5 py-[18px] text-center text-[12px] text-mute2">
                    {crm.attentionOnly ? "Nothing needs attention here" : "No leads"}
                  </div>
                ) : null}
                {cards.map((l) => <LeadCard key={l.id} lead={l} />)}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead: l }: { lead: Lead }) {
  const crm = useSalesCrm();
  const owner = crm.users[l.owner];
  const flag = flagOf(l);
  const meta: { k: string; v: string; rust?: boolean }[] = [
    { k: "Contact", v: l.contact },
    { k: "Source", v: l.source },
    { k: "Last contacted", v: l.lastContacted },
    { k: "Next follow-up", v: l.next ? `${l.next.label} · ${l.next.type}` : "—", rust: l.next?.due === "overdue" },
  ];
  return (
    <Button variant="secondary" layout="content" size="custom"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(l.id)); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => crm.openLead(l.id)}
      aria-label={`${l.gym}, ${l.city}. ${flag ? `${flag.label}. ` : ""}Assigned to ${owner.name}. Open lead`}
      className="flex w-full min-w-0 flex-col gap-2.5 border-[1.5px] border-line bg-paper p-3 text-left hover:border-ink"
    >
      <div className="flex items-start gap-2">
        <CrmIcon size={15} className="mt-0.5 flex-shrink-0 text-mute" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-bold leading-tight">{l.gym}</span>
          <span className="text-[12px] text-mute">{l.city}, {l.state}</span>
        </span>
        {l.priority === "high" ? (
          <span className="flex-shrink-0 border-[1.5px] border-accent px-1.5 py-0.5 text-[9.5px] font-bold normal-case tracking-[0.1em] text-accent">High</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        {meta.map((m) => (
          <div key={m.k} className="flex min-w-0 flex-col gap-px">
            <dt className="text-[9.5px] font-bold normal-case tracking-[0.1em] text-mute2">{m.k}</dt>
            <dd className={`truncate text-[12.5px] font-medium ${m.rust ? "text-accent" : "text-ink"}`}>{m.v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 border-t border-line pt-2">
        {flag ? (
          <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[11.5px] font-bold ${flag.text}`}>
            <span aria-hidden className={`h-[7px] w-[7px] flex-shrink-0 ${flag.dot}`} />
            <span className="truncate">{flag.label}</span>
          </span>
        ) : (
          <span className="flex-1 text-[11.5px] text-mute2">{l.source}</span>
        )}
        <OwnerBadge user={owner} />
      </div>
    </Button>
  );
}
