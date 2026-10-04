"use client";

import { Button } from "@/components/Button";
import { attentionGroups, attentionRow } from "@/features/sales/derive";
import { STAGE_LABEL, type AttentionReason, type Lead } from "@/features/sales/model";
import { useSalesCrm } from "@/features/sales/use-sales-crm";
import { useVisibleLeads } from "@/features/sales/use-visible-leads";

export function AttentionView() {
  const crm = useSalesCrm();
  const { shown } = useVisibleLeads();
  const list = shown;
  const groups = attentionGroups(list);

  function act(l: Lead, reason: AttentionReason) {
    if (reason === "demo") return crm.openModal({ kind: "demo", id: l.id, variant: "confirm" });
    if (reason === "trial") return crm.openLead(l.id);
    crm.openModal({ kind: "activity", id: l.id, tab: "log" });
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border-[1.5px] border-line px-5 py-12 text-center">
        <span className="text-[16px] font-bold">Nothing needs attention</span>
        <span className="text-[13px] text-mute">Follow-ups, demo requests and trials are all on track.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.reason} aria-label={g.title} className="border-[1.5px] border-line">
          <header className="flex items-center gap-2.5 border-b border-line bg-sand px-3.5 py-2.5">
            <span aria-hidden className={`h-2 w-2 ${g.dot}`} />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.13em]">{g.title}</h2>
            <span className="text-[12px] font-bold text-mute">{g.leads.length}</span>
            <span className="ml-auto hidden text-[11.5px] text-mute2 sm:inline">{g.hint}</span>
          </header>
          {g.leads.map((l) => {
            const row = attentionRow(l, g.reason);
            const owner = crm.users[l.owner];
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-b border-line px-3.5 py-3 last:border-b-0">
                <Button type="button" variant="control" size="custom" onClick={() => crm.openLead(l.id)}
                  className="min-h-[44px] min-w-0 flex-1 basis-[240px] justify-start gap-3 px-0 text-left hover:bg-transparent">
                  <span title={owner.name} className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center border-[1.5px] border-ink text-[10px] font-bold">{owner.initials}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[14px] font-bold">{l.gym}</span>
                    <span className="text-[12px] font-normal text-mute">{l.city} · {STAGE_LABEL[l.stage]}</span>
                  </span>
                </Button>
                <span className={`flex-1 basis-[180px] text-[12.5px] font-bold ${row.urgent ? "text-accent" : "text-ink"}`}>{row.detail}</span>
                <Button type="button" variant="secondary" size="md" onClick={() => act(l, g.reason)} className="flex-none max-sm:flex-[1_1_100%]">
                  {row.cta}
                </Button>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
