"use client";

import { useState } from "react";
import { schedulingDays, TIME_SLOTS } from "@/features/sales/scheduling";
import { Button } from "@/components/Button";
import { LEAD_SOURCES, BOARD_COLUMNS, STAGE_OPTIONS, type FollowUpType, type Lead, type LeadFilters } from "@/features/sales/model";
import { useSalesCrm, type ModalState } from "@/features/sales/use-sales-crm";
import { Segmented } from "./crm-ui";
import { AreaField, Field, InfoField, ModalFrame, RadioCards, SelectField, TextField } from "./crm-modal";
import { CrmIcon } from '@/core/ui/icons';
import { iconForAction } from '@/core/ui/action-icons';

type Of<K extends ModalState["kind"]> = Extract<ModalState, { kind: K }>;

export function FiltersModal() {
  const crm = useSalesCrm();
  const f = crm.filters;
  const any = (opts: (string | { value: string; label: string })[]) => [{ value: "", label: "Any" }, ...opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o))];
  const set = (k: keyof LeadFilters) => (v: string) => crm.patchFilters({ [k]: v });
  const visibleUsers = Object.values(crm.users).filter((u) => crm.role === "admin" || u.team === crm.me.team);
  const states = (crm.coverage.kids ?? []).map(n=>n.name).sort();
  const cities = [...new Set((crm.coverage.kids ?? []).filter(n=>!f.state || n.name===f.state).flatMap(n=>(n.kids??[]).map(c=>c.name)))].sort();

  return (
    <ModalFrame title="Filters" sub="Results update as you choose" onClose={crm.closeModal}
      secondaryLabel="Clear all" onSecondary={() => crm.patchFilters({ owner: "", stage: "", source: "", state: "", city: "", area: "", pin: "", priority: "", followUp: "", demo: "", trial: "", range: "" })}
      primaryLabel={`Show ${crm.total} leads`} onPrimary={crm.closeModal}>
      {crm.role !== "rep" ? <SelectField label="Salesperson" value={f.owner} onChange={set("owner")} options={any(visibleUsers.map((u) => ({ value: u.id, label: u.name })))} /> : null}
      <SelectField label="CRM stage" value={f.stage} onChange={set("stage")} options={any(STAGE_OPTIONS)} />
      <SelectField label="Lead source" value={f.source} onChange={set("source")} options={any(LEAD_SOURCES)} />
      <SelectField label="State" value={f.state} onChange={set("state")} options={any(states)} />
      <SelectField label="City" value={f.city} onChange={set("city")} options={any(cities)} />
      <TextField label="Area" value={f.area} onChange={set("area")} placeholder="e.g. Madhapur" />
      <TextField label="PIN code" value={f.pin} onChange={set("pin")} placeholder="e.g. 500081" />
      <Field label="Priority">
        <Segmented wrap ariaLabel="Priority" value={f.priority} onChange={(v) => crm.patchFilters({ priority: v })} options={[{ value: "", label: "Any" }, { value: "high", label: "High only" }]} />
      </Field>
      <SelectField label="Follow-up" value={f.followUp} onChange={set("followUp")} options={any([{ value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }, { value: "upcoming", label: "Upcoming" }, { value: "none", label: "None scheduled" }])} />
      <SelectField label="Demo" value={f.demo} onChange={set("demo")} options={any([{ value: "requested", label: "Requested" }, { value: "scheduled", label: "Scheduled" }, { value: "completed", label: "Completed" }, { value: "no show", label: "No show" }, { value: "cancelled", label: "Cancelled" }])} />
      <SelectField label="Trial" value={f.trial} onChange={set("trial")} options={any([{ value: "active", label: "Active" }, { value: "ending", label: "Ending in 3 days" }])} />
      <SelectField label="Created" value={f.range} onChange={set("range")} options={any([{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }])} />
    </ModalFrame>
  );
}

export function StagesModal() {
  const crm = useSalesCrm();
  return (
    <ModalFrame title="Choose stage" onClose={crm.closeModal} footer={false}>
      <div className="flex flex-col border-[1.5px] border-line">
        {BOARD_COLUMNS.map((c, i) => (
          <Button icon={CrmIcon} key={c.key} type="button" variant="surface" onClick={() => { crm.setMobileStage(i); crm.closeModal(); }}
            className={`min-h-[52px] items-center border-b border-line px-3.5 text-left text-[14.5px] font-bold text-ink last:border-b-0 ${crm.mobileStage === i ? "bg-sand" : "bg-paper"}`}>
            {c.label}
          </Button>
        ))}
      </div>
    </ModalFrame>
  );
}

export function MoreModal({ modal, lead }: { modal: Of<"more">; lead: Lead }) {
  const crm = useSalesCrm();
  const canReassign = crm.role === "admin" || (crm.role === "manager" && crm.users[lead.owner].team === crm.me.team);
  const go = (next: ModalState) => () => crm.openModal(next);
  const items: { label: string; sub?: string; act: () => void; disabled?: boolean }[] = [
    { label: "Log activity", sub: "Call, WhatsApp, email, meeting or note", act: go({ kind: "activity", id: modal.id, tab: "log" }) },
    { label: "Schedule follow-up", act: go({ kind: "activity", id: modal.id, tab: "followup" }) },
    ...(lead.stage === "demo_req" ? [{ label: "Confirm demo", sub: `Preferred ${lead.demo?.when}`, act: go({ kind: "demo", id: modal.id, variant: "confirm" }) }] : []),
    { label: "Reassign", sub: canReassign ? `Currently ${crm.users[lead.owner].name}` : "Only a manager or admin can reassign", act: go({ kind: "reassign", id: modal.id }), disabled: !canReassign },
    ...(!["converted","lost","notint","later"].includes(lead.stage) ? [{ label: lead.organizationId?'Confirm paid conversion':'Create / link gym', sub: lead.organizationId?'Verify active paid subscription':'Start a trial or link an existing account', act: () => { crm.closeModal(); crm.commands.moveLead(modal.id, "converted"); } }] : []),
    ...(!["converted", "later", "notint", "lost"].includes(lead.stage) ? [{ label: "Mark lost / not interested", act: go({ kind: "lost", id: modal.id, outcome: "Lost" }) }] : []),
  ];
  return (
    <ModalFrame title={lead.gym} sub="Lead actions" onClose={crm.closeModal} footer={false}>
      <div className="flex flex-col border-[1.5px] border-line">
        {items.map((i) => {
          const ActionIcon=iconForAction(i.label);
          return (
          <Button key={i.label} type="button" variant="surface" disabled={i.disabled} onClick={i.act}
            className="min-h-[52px] flex-col items-start justify-center gap-0.5 border-b border-line bg-paper px-3.5 text-left text-ink last:border-b-0">
            <span className="flex items-center gap-2 text-[14.5px] font-bold"><ActionIcon size={15} className="flex-shrink-0" aria-hidden />{i.label}</span>
            {i.sub ? <span className="text-[12px] font-normal text-mute2">{i.sub}</span> : null}
          </Button>
          );
        })}
      </div>
    </ModalFrame>
  );
}

const LOG_TYPES = ["Call", "WhatsApp", "Email", "Meeting", "Note"] as const;
const FU_TYPES: FollowUpType[] = ["Call", "WhatsApp", "Email", "Meeting", "Demo"];

export function ActivityModal({ modal, lead }: { modal: Of<"activity">; lead: Lead }) {
 const FOLLOW_UP_DAYS=schedulingDays(false);
  const crm = useSalesCrm();
  const [tab, setTab] = useState(modal.tab);
  const [logType, setLogType] = useState<(typeof LOG_TYPES)[number]>("Call");
  const [fuType, setFuType] = useState<FollowUpType>("Call");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(FOLLOW_UP_DAYS[0].value);
  const [time, setTime] = useState("11:00 AM");
  const [tried, setTried] = useState(false);
  const noteMissing = tab === "log" && logType === "Note" && !note.trim();

  function submit() {
    if (noteMissing) return setTried(true);
    if (tab === "log") crm.commands.logActivity(lead.id, { type: logType, note });
    else crm.commands.scheduleFollowUp(lead.id, { type: fuType, date, time, note });
  }

  return (
    <ModalFrame title={lead.gym} sub={tab === "log" ? "Adds an entry to the activity timeline" : "You’ll see it in Needs attention if it becomes overdue"}
      onClose={crm.closeModal} primaryLabel={tab === "log" ? "Save activity" : "Schedule follow-up"} onPrimary={submit}>
      <Segmented ariaLabel="Action" value={tab} onChange={(v) => { setTab(v); setTried(false); }} size="lg"
        options={[{ value: "log", label: "Log activity" }, { value: "followup", label: "Schedule follow-up" }]} />
      {tab === "log" ? (
        <>
          <Field label="Type"><Segmented wrap ariaLabel="Type" value={logType} onChange={setLogType} options={LOG_TYPES.map((v) => ({ value: v, label: v }))} /></Field>
          <AreaField label={logType === "Note" ? "Note" : "What happened? (optional)"} value={note} onChange={setNote}
            placeholder={logType === "Note" ? "Write a note for the team" : "e.g. Owner wants pricing for 2 branches"}
            error={tried && noteMissing ? "Write the note before saving" : undefined} />
        </>
      ) : (
        <>
          <SelectField label="Date" value={date} onChange={setDate} options={FOLLOW_UP_DAYS} />
          <SelectField label="Time" value={time} onChange={setTime} options={TIME_SLOTS} />
          <Field label="Follow-up type"><Segmented wrap ariaLabel="Follow-up type" value={fuType} onChange={setFuType} options={FU_TYPES.map((v) => ({ value: v, label: v }))} /></Field>
          <AreaField label="Notes (optional)" value={note} onChange={setNote} placeholder="What should happen on this follow-up?" />
        </>
      )}
    </ModalFrame>
  );
}

export function DemoModal({ modal, lead }: { modal: Of<"demo">; lead: Lead }) {
  const crm = useSalesCrm();
  const DEMO_DAYS=schedulingDays(true);
  const confirmLayout = modal.variant === "confirm" || modal.variant === "suggest";
  const [mode, setMode] = useState<"requested" | "other">(modal.variant === "suggest" ? "other" : "requested");
  const [date, setDate] = useState(DEMO_DAYS[0].value);
  const [time, setTime] = useState(modal.variant === "suggest" ? "5:00 PM" : "4:00 PM");
  const [note, setNote] = useState("");
  const pick = [
    <SelectField key="d" label="Date" value={date} onChange={setDate} options={DEMO_DAYS} help="Demos run Mon–Sat, 10:00 AM–6:30 PM IST" />,
    <SelectField key="t" label="Time" value={time} onChange={setTime} options={TIME_SLOTS} />,
  ];
  const title = confirmLayout ? "Confirm demo" : modal.variant === "reschedule" ? "Reschedule demo" : "Schedule demo";
  const primary = confirmLayout ? (mode === "requested" ? "Confirm demo" : "Send suggestion") : modal.variant === "reschedule" ? "Reschedule" : "Schedule demo";

  return (
    <ModalFrame title={title} sub={lead.gym} onClose={crm.closeModal} primaryLabel={primary}
      onPrimary={() => { crm.commands.saveDemo(lead.id, { variant: confirmLayout ? "confirm" : modal.variant, mode, date, time, note }); }}>
      {confirmLayout ? (
        <>
          <InfoField label="Requested slot" value={lead.demo?.when ?? "—"} info={`From ${lead.contact} via ${lead.source}`} />
          <RadioCards value={mode} onChange={setMode} options={[
            { value: "requested", label: "Confirm requested time", sub: "Moves the lead to Demo scheduled" },
            { value: "other", label: "Suggest another time", sub: "Stays in Demo requested until they agree" },
          ]} />
          {mode === "other" ? pick : null}
          <AreaField label="Note (optional)" value={note} onChange={setNote} placeholder="e.g. Confirmed on WhatsApp" />
        </>
      ) : (
        <>
          {modal.variant === "reschedule" && lead.demo ? <InfoField label="Current slot" value={lead.demo.when} /> : null}
          {pick}
          <AreaField label="Note (optional)" value={note} onChange={setNote} />
        </>
      )}
    </ModalFrame>
  );
}
