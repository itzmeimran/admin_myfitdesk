"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { LuChevronRight } from "react-icons/lu";
import { COVERAGE_FILTER_KEYS, COVERAGE_LEVELS, EMPTY_FILTERS, type CoverageCounts, type CoverageNode } from "@/features/sales/model";
import { useSalesCrm } from "@/features/sales/use-sales-crm";
import { TileStrip } from "./crm-ui";
import { DetailsIcon, ManageIcon } from '@/core/ui/icons';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const sum = (kids: CoverageNode[]): CoverageCounts =>
  kids.reduce<CoverageCounts>((acc, k) => [acc[0] + k.n[0], acc[1] + k.n[1], acc[2] + k.n[2], acc[3] + k.n[3]], [0, 0, 0, 0]);

const LEGEND = [
  { label: "Customers", cls: "bg-ink" },
  { label: "On trial", cls: "bg-hi" },
  { label: "Contacted", cls: "bg-mute3" },
  { label: "Identified, not contacted", cls: "bg-line" },
];

/** Drill-down: country → state → city → area → PIN. `root` comes from the server page. */
export function CoverageView({ root }: { root: CoverageNode }) {
  const crm = useSalesCrm();
  const router = useRouter();
  const toast = useToast();
  const [path, setPath] = useState<string[]>([]);

  const nodes = [root];
  let node = root;
  for (const name of path) {
    const child = node.kids?.find((k) => k.name === name);
    if(!child)break;
    node=child;
    nodes.push(node);
  }
  const depth = nodes.length-1;
  const kids = node.kids ?? [];
  const total = depth === 0 ? sum(kids) : node.n;
  const [identified, contacted, trials, customers] = total;

  function viewLeads(child: CoverageNode) {
    const patch = { ...EMPTY_FILTERS };
    path.slice(0,depth).forEach((name, i) => { patch[COVERAGE_FILTER_KEYS[i]] = name; });
    patch[COVERAGE_FILTER_KEYS[depth]] = child.name;
    crm.patchFilters(patch);
    toast.success(`Showing leads in ${child.name}`);
    router.push("/admin/sales");
  }

  return (
    <div className="flex flex-col gap-3.5">
      <nav aria-label="Coverage level" className="flex flex-wrap items-center gap-1">
        {nodes.map((n, i) => {
          const last = i === nodes.length - 1;
          return (
            <span key={n.name} className="flex items-center gap-1">
              <Button icon={ManageIcon} type="button" variant="control" size="custom" aria-current={last ? "page" : undefined} onClick={() => setPath(path.slice(0, i))}
                className={`min-h-[36px] px-2 text-[13px] font-bold ${last ? "text-ink" : "text-accent"}`}>
                {n.name}
              </Button>
              {!last ? <span aria-hidden className="text-[#a99d91]">/</span> : null}
            </span>
          );
        })}
      </nav>

      <TileStrip ink cols="grid-cols-2 md:grid-cols-4" tiles={[
        { label: "Gyms identified", value: identified, hint: node.name },
        { label: "Contacted", value: contacted, hint: `${pct(contacted, identified)} of identified` },
        { label: "On trial", value: trials, hint: "Active trials now" },
        { label: "Customers", value: customers, hint: `${pct(customers, identified)} of identified` },
      ]} />

      <div aria-hidden className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-mute">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5"><span className={`h-2 w-3 ${l.cls}`} />{l.label}</span>
        ))}
      </div>

      <div role="table" aria-label={`${COVERAGE_LEVELS[depth] ?? "Area"} coverage`} className="border-[1.5px] border-line">
        <div role="row" className="hidden gap-2.5 border-b border-line bg-sand px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-mute md:grid md:grid-cols-[minmax(0,1.4fr)_repeat(4,84px)_minmax(0,1.6fr)_110px]">
          <span role="columnheader">{COVERAGE_LEVELS[depth] ?? "Area"}</span>
          <span role="columnheader">Identified</span><span role="columnheader">Contacted</span><span role="columnheader">Trials</span><span role="columnheader">Customers</span>
          <span role="columnheader">Coverage</span><span role="columnheader" />
        </div>
        {kids.map((k) => {
          const [id, ct, tr, cu] = k.n;
          const nums: [string, number][] = [["Identified", id], ["Contacted", ct], ["Trials", tr], ["Customers", cu]];
          return (
            <div key={k.name} role="row" className="grid grid-cols-4 items-center gap-2.5 border-b border-line px-3.5 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_repeat(4,84px)_minmax(0,1.6fr)_110px]">
              <span role="cell" className="col-span-4 flex items-center gap-2 md:col-span-1">
                {k.kids ? (
                  <Button icon={LuChevronRight} type="button" variant="control" size="custom" onClick={() => setPath([...path, k.name])}
                    className="min-h-[36px] justify-start gap-1.5 px-0 text-left text-[14px] font-bold hover:bg-transparent">
                    {k.name}
                  </Button>
                ) : <span className="text-[14px] font-bold">{k.name}</span>}
              </span>
              {nums.map(([label, v]) => (
                <span key={label} role="cell" className="flex flex-col gap-px">
                  <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute2 md:hidden">{label}</span>
                  <span className="text-[14px] font-bold">{v}</span>
                </span>
              ))}
              <span role="cell" className="col-span-4 flex items-center gap-2.5 md:col-span-1">
                <span className="flex h-2.5 flex-1 bg-line" aria-label={`${pct(ct, id)} contacted, ${cu} customers of ${id}`}>
                  <span style={{ width: pct(cu, id) }} className="bg-ink" />
                  <span style={{ width: pct(tr, id) }} className="bg-hi" />
                  <span style={{ width: pct(Math.max(ct - tr - cu, 0), id) }} className="bg-mute3" />
                </span>
                <span className="min-w-16 text-right text-[12px] font-bold">{pct(ct, id)} contacted</span>
              </span>
              <Button icon={DetailsIcon} type="button" variant="secondary" size="sm" onClick={() => viewLeads(k)} className="col-span-4 justify-self-start md:col-span-1 md:justify-self-end">
                View leads
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-mute2">“Identified” counts every gym the team has logged in this area, including ones not yet contacted.</p>
    </div>
  );
}
