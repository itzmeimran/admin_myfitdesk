"use client";

import { Dropdown } from "@/components/Dropdown";
import { useSalesCrm } from "@/features/sales/use-sales-crm";
import type { Analytics } from "@/features/sales/data";
import { TileStrip, SectionTitle } from "./crm-ui";


const PERIODS = [
  { value: "90", label: "Last 90 days" },
  { value: "30", label: "Last 30 days" },
  { value: "year", label: "This year" },
];

function Bars({ rows, max, color }: { rows: [string, number][]; max: number; color: (label: string) => string }) {
  return (
    <>
      {rows.map(([label, n]) => (
        <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)_34px] items-center gap-2.5 text-[12.5px]">
          <span>{label}</span>
          <span className="h-2.5 bg-sand"><span className={`block h-full ${color(label)}`} style={{ width: `${Math.round((n / max) * 100)}%` }} /></span>
          <span className="text-right font-bold">{n}</span>
        </div>
      ))}
    </>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: { v: string; bold?: boolean }[][] }) {
  const cols = "grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]";
  return (
    <section aria-label={title} className="border-[1.5px] border-line">
      <h2 className="border-b border-line px-3.5 py-3 text-[11px] font-bold uppercase tracking-[0.13em] text-mute">{title}</h2>
      <div role="table">
        <div role="row" className={`grid ${cols} gap-2 bg-sand px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-mute`}>
          {head.map((h) => <span key={h} role="columnheader">{h}</span>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} role="row" className={`grid ${cols} items-center gap-2 border-t border-line px-3.5 py-2.5 text-[13px]`}>
            {r.map((c, j) => <span key={j} role="cell" className={`min-w-0 truncate ${c.bold ? "font-bold" : "font-medium"}`}>{c.v}</span>)}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Aggregates cover the complete authorized scope, independent of board pagination. */
export function AnalyticsView({ data }: { data: Analytics }) {
  const crm = useSalesCrm();
  const {period,setPeriod} = crm;
  const scopeText = crm.role === "rep" ? "Your leads only" : crm.role === "manager" ? `${crm.me.team ?? "Unassigned"} team` : "All teams";
  const people = data.people.filter(([u]) => crm.role === "admin" ? true : crm.role === "manager" ? crm.users[u].team === crm.me.team : u === crm.me.id);
  const fuTotal = Math.max(1,data.followUps.done + data.followUps.overdue);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[160px]"><Dropdown ariaLabel="Period" size="sm" value={period} onChange={setPeriod} options={PERIODS} /></div>
        <span className="text-[12px] text-mute2">{scopeText}</span>
      </div>

      <TileStrip ink cols="grid-cols-2 md:grid-cols-4" tiles={data.kpis} />

      <div className="grid gap-3.5 lg:grid-cols-2">
        <section aria-labelledby="a-stage" className="flex flex-col gap-2.5 border-[1.5px] border-line p-3.5">
          <SectionTitle id="a-stage">Leads by stage</SectionTitle>
          <Bars rows={data.stages} max={Math.max(1,...data.stages.map(r=>r[1]))} color={(l) => (l === "Later / lost" ? "bg-[#a99d91]" : "bg-ink")} />
        </section>
        <section aria-labelledby="a-lost" className="flex flex-col gap-2.5 border-[1.5px] border-line p-3.5">
          <SectionTitle id="a-lost">Lost &amp; not interested · reasons</SectionTitle>
          <Bars rows={data.lostReasons} max={Math.max(1,...data.lostReasons.map(r=>r[1]))} color={() => "bg-mute"} />
          <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
            <SectionTitle>Follow-ups this month</SectionTitle>
            <span className="flex h-3">
              <span className="bg-ink" style={{ width: `${(data.followUps.done / fuTotal) * 100}%` }} />
              <span className="bg-accent" style={{ width: `${(data.followUps.overdue / fuTotal) * 100}%` }} />
            </span>
            <span className="flex gap-4 text-[12.5px]">
              <span><b>{data.followUps.done}</b> completed</span>
              <span className="text-accent"><b>{data.followUps.overdue}</b> overdue</span>
            </span>
          </div>
        </section>
      </div>

      <Table
        title="Lead source performance"
        head={["Source", "Leads", "Demos", "Converted", "Rate"]}
        rows={data.sources.map(([s, leads, demos, conv]) => [{ v: s, bold: true }, { v: String(leads) }, { v: String(demos) }, { v: String(conv) }, { v: `${leads ? Math.round((conv / leads) * 100) : 0}%`, bold: true }])}
      />
      <Table
        title={crm.role === "rep" ? "Your performance" : "Salesperson performance"}
        head={["Salesperson", "Leads", "Follow-ups done", "Overdue", "Converted"]}
        rows={people.map(([u, leads, done, overdue, conv]) => [{ v: crm.users[u].name, bold: true }, { v: String(leads) }, { v: String(done) }, { v: String(overdue), bold: overdue > 0 }, { v: String(conv) }])}
      />
    </div>
  );
}
