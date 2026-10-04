"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { searchSalesOrganizations } from "./actions";
import { revisitLabel, type OrgCandidate } from "@/features/sales/data";
import { LOST_REASONS, PLAN_OPTIONS, STAGE_LABEL, isClosedStage, type Lead } from "@/features/sales/model";
import { useSalesCrm, type ModalState } from "@/features/sales/use-sales-crm";
import { Segmented } from "./crm-ui";
import { AreaField, Field, InfoField, ModalFrame, RadioCards, SelectField, TextField } from "./crm-modal";

type Of<K extends ModalState["kind"]> = Extract<ModalState, { kind: K }>;

export function ReassignModal({ lead }: { lead: Lead }) {
  const crm = useSalesCrm();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const openCount = (u: string) => crm.leads.filter((l) => l.owner === u && !isClosedStage(l.stage) && l.stage !== "converted").length;
  const pool = Object.values(crm.users).filter((u) => u.assignable && u.id !== lead.owner && (crm.role === "admin" || u.team === crm.me.team));
  const owner = crm.users[lead.owner];

  return (
    <ModalFrame title="Reassign lead" sub={lead.gym} onClose={crm.closeModal} primaryLabel="Reassign"
      note={crm.role === "manager" ? `You can reassign within the ${crm.me.team ?? "assigned"} team only.` : "Activity history is preserved. Access follows the new assignment."}
      onPrimary={() => { if (!to) return setTried(true); crm.commands.reassign(lead.id, to, note); }}>
      <InfoField label="Currently assigned to" value={owner.name} info={owner.title} />
      <RadioCards label="Reassign to" value={to} onChange={setTo} error={tried && !to ? "Choose who should own this lead" : undefined}
        options={pool.map((u) => ({ value: u.id, label: u.name, sub: `${u.title} · ${openCount(u.id)} open leads` }))} />
      <AreaField label="Reason (optional)" value={note} onChange={setNote} placeholder="e.g. Territory change" />
    </ModalFrame>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ConvertModal({ lead }: { lead: Lead }) {
  const crm = useSalesCrm();
  const [how, setHow] = useState<"link" | "invite">("link");
  const [search, setSearch] = useState("");
  const [orgId, setOrgId] = useState("");
  const [plan, setPlan] = useState(PLAN_OPTIONS[0]);
  const [owner, setOwner] = useState(lead.contact);
  const [email, setEmail] = useState(lead.email);
  const [tried, setTried] = useState(false);
  const [orgs,setOrgs]=useState<OrgCandidate[]>([]);
  const [searchError,setSearchError]=useState<string|null>(null);
  const [searching,startSearch]=useTransition();
  useEffect(()=>{let active=true;const timer=setTimeout(()=>startSearch(async()=>{try{const r=await searchSalesOrganizations(lead.id,search);if(active){setOrgs(r.data);setSearchError(r.error);}}catch{if(active)setSearchError("Unable to search gyms");}}),250);return()=>{active=false;clearTimeout(timer);};},[lead.id,search]);
  const chosen=orgs.find(o=>o.id===orgId);
  const emailBad = !EMAIL_RE.test(email);

  function submit() {
    if (how === "link" && !chosen) return setTried(true);
    if (how === "invite" && (emailBad || !owner.trim())) return setTried(true);
    crm.commands.convert(lead.id, { how, organizationId: chosen?.id, ownerName: owner, plan, email });
  }

  return (
    <ModalFrame title="Convert lead" sub={`${lead.gym} · we won’t create a duplicate gym`} onClose={crm.closeModal}
      primaryLabel={how === "link" ? "Link & convert" : "Send invite & convert"} onPrimary={submit}
      note="Converting stops sales follow-up reminders. All CRM activity stays on this lead.">
      <RadioCards label="How does this gym join MyFitDesk?" value={how} onChange={setHow} options={[
        { value: "link", label: "Link existing gym", sub: "The gym already has a MyFitDesk account" },
        ...(crm.canInviteOwner ? [{ value: "invite" as const, label: "Create / invite gym owner", sub: "No account yet. We’ll email the owner an invite." }] : []),
      ]} />
      {how === "link" ? (
        <>
          <TextField label="Find the gym" value={search} onChange={setSearch} placeholder="Search by gym name or owner phone" error={tried && !chosen ? "Choose the gym to link" : undefined} />
          {searching ? <span role="status">Searching gyms…</span> : null}
          {searchError ? <span role="alert" className="text-accent">{searchError}</span> : null}
          {!searching && !searchError && !orgs.length ? <span>No matching gyms</span> : null}
          <div role="radiogroup" aria-label="Matching gyms" className="flex flex-col gap-1.5">
            {orgs.map((o) => {
              const on = o.id === orgId;
              return (
                <Button key={o.id} type="button" role="radio" aria-checked={on} variant="surface" onClick={() => setOrgId(o.id)}
                  className={`min-h-[56px] items-center gap-3 border-[1.5px] px-3 py-2.5 text-left text-ink ${on ? "border-ink bg-sand" : "border-line bg-paper hover:border-ink"}`}>
                  <span aria-hidden className="flex h-4 w-4 flex-shrink-0 items-center justify-center border-[1.5px] border-ink"><span className={`h-2 w-2 ${on ? "bg-ink" : "bg-transparent"}`} /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-bold">{o.name}</span>
                    <span className="text-[12px] font-normal text-mute">{o.meta}</span>
                    {o.match ? <span className="text-[11.5px] font-bold">{o.match}</span> : null}
                  </span>
                  <span className="flex-shrink-0 border-[1.5px] border-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-mute">{o.status}</span>
                </Button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <TextField label="Owner name" value={owner} onChange={setOwner} />
          <TextField label="Owner email" type="email" value={email} onChange={setEmail} error={tried && emailBad ? "Enter a valid email for the invite" : undefined} />
        </>
      )}
      <SelectField label="Expected plan" value={plan} onChange={setPlan} options={PLAN_OPTIONS} help={how === 'invite' ? 'Creates a trial account. The owner selects a paid plan after joining.' : 'Records sales intent; the existing subscription remains in effect.'} />
    </ModalFrame>
  );
}

const OUTCOMES = ["Lost", "Not interested", "Follow up later"] as const;
const REVISIT = [
  { value: "2 weeks", label: `2 weeks · ${revisitLabel(0)}` },
  { value: "1 month", label: `1 month · ${revisitLabel(1)}` },
  { value: "3 months", label: `3 months · ${revisitLabel(3)}` },
];

export function LostModal({ modal, lead }: { modal: Of<"lost">; lead: Lead }) {
  const crm = useSalesCrm();
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>(modal.outcome);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [revisit, setRevisit] = useState("2 weeks");
  const [tried, setTried] = useState(false);
  const later = outcome === "Follow up later";
  const reasonMissing = !later && !reason;
  const noteMissing = reason === "Other" && !note.trim();

  return (
    <ModalFrame title={later ? "Follow up later" : "Close lead"} sub={lead.gym} onClose={crm.closeModal}
      primaryLabel={later ? "Move to follow up later" : `Mark as ${outcome.toLowerCase()}`}
      note={later ? "A revisit follow-up will appear in this lead. Complete it to reopen the lead; no external reminder is sent." : "Reasons feed the Lost reasons report in Analytics."}
      onPrimary={() => {
        if (reasonMissing || noteMissing) return setTried(true);
        crm.commands.closeLead(lead.id, { outcome, reason, note, revisit });
      }}>
      <Field label="Outcome"><Segmented wrap ariaLabel="Outcome" value={outcome} onChange={setOutcome} options={OUTCOMES.map((v) => ({ value: v, label: v }))} /></Field>
      {later ? (
        <SelectField label="Revisit in" value={revisit} onChange={setRevisit} options={REVISIT} />
      ) : (
        <Field label="Reason" error={tried && reasonMissing ? "Choose a reason. It helps the team see why deals don’t close." : undefined}>
          <Segmented wrap ariaLabel="Reason" value={reason} onChange={setReason} options={LOST_REASONS.map((v) => ({ value: v, label: v }))} />
        </Field>
      )}
      <AreaField label={reason === "Other" ? "Notes" : "Notes (optional)"} value={note} onChange={setNote} placeholder="Anything the team should know"
        error={tried && noteMissing ? "Add a short note for “Other”" : undefined} />
    </ModalFrame>
  );
}

type Side = "existing" | "new";

export function DuplicateModal({ lead }: { lead: Lead }) {
  const crm = useSalesCrm();
  const existing = lead.duplicateOf !== null ? crm.getLead(lead.duplicateOf) : undefined;
  const [mode, setMode] = useState<"merge" | "separate">(existing ? "merge" : "separate");
  const [picks, setPicks] = useState<{ gym: Side; contact: Side; email: Side }>({ gym: "existing", contact: "new", email: "new" });
  const [why, setWhy] = useState("");
  const [tried, setTried] = useState(false);
  if (!existing) return (
    <ModalFrame title="Possible existing lead" sub="The matching lead is outside your access or unavailable." onClose={crm.closeModal}
      primaryLabel="Keep separate" onPrimary={()=>{if(!why.trim())return setTried(true);crm.commands.resolveDuplicate(lead.id,{mode:'separate',why});}}>
      <p className="text-[13px] text-mute">Ask a platform owner to review or merge the match. If this is a different gym, record the reason to keep it separate.</p>
      <TextField label="Why keep separate?" value={why} onChange={setWhy} error={tried&&!why.trim()?'Add a reason':undefined}/>
    </ModalFrame>
  );

  const rows: { label: string; a: string; b: string; key?: "gym" | "contact" | "email" }[] = [
    { label: "Gym", a: existing.gym, b: lead.gym, key: "gym" },
    { label: "Contact", a: existing.contact, b: lead.contact, key: "contact" },
    { label: "Phone", a: existing.phone, b: lead.phone },
    { label: "Email", a: existing.email, b: lead.email, key: "email" },
    { label: "Area", a: existing.area, b: lead.area },
    { label: "Stage", a: `${STAGE_LABEL[existing.stage]} · ${crm.users[existing.owner].name}`, b: "Demo requested · Website" },
  ];

  return (
    <ModalFrame title="Possible existing lead" sub={`Possible phone or email match · created ${existing.createdOn}`} onClose={crm.closeModal}
      secondaryLabel="Open existing lead" onSecondary={() => { crm.closeModal(); crm.openLead(existing.id); }}
      primaryLabel={mode === "merge" ? "Merge leads" : "Keep separate"}
      onPrimary={() => {
        if (mode === "separate" && !why.trim()) return setTried(true);
        crm.commands.resolveDuplicate(lead.id, mode === "merge" ? { mode, picks } : { mode, why });
      }}>
      {mode === "merge" ? (
        <>
          <div className="flex flex-col border-[1.5px] border-line">
            <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-2.5 bg-sand px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-mute md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
              <span>Field</span><span>Existing lead</span><span>New request</span>
            </div>
            {rows.map((r) => {
              const same = !r.key || r.a === r.b;
              const cell = (side: Side, text: string) => {
                const on = !same && r.key && picks[r.key] === side;
                return (
                  <Button type="button" variant="control" size="custom" disabled={same} aria-pressed={!!on}
                    onClick={() => r.key && setPicks({ ...picks, [r.key]: side })}
                    className={`min-h-[36px] justify-start border-[1.5px] px-2 py-1 text-left text-[13px] [overflow-wrap:anywhere] disabled:opacity-100 ${on ? "border-ink font-bold" : same ? "border-transparent font-bold" : "border-line font-medium"}`}>
                    {text}
                  </Button>
                );
              };
              return (
                <div key={r.label} className={`grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 border-t border-line px-3 py-2.5 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] ${same ? "text-mute2" : ""}`}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-mute2">{r.label}</span>
                  {cell("existing", r.a)}{cell("new", r.b)}
                </div>
              );
            })}
          </div>
          <span className="text-[12px] text-mute2">Matching fields are greyed out. For fields that differ, tap the value to keep.</span>
        </>
      ) : null}
      <RadioCards value={mode} onChange={setMode} options={[
        { value: "merge", label: "Merge into existing lead", sub: "Reopens it as Demo requested. History from both is kept.", tag: "Recommended" },
        { value: "separate", label: "Keep separate", sub: "Only if it’s a different gym or branch" },
      ]} />
      {mode === "separate" ? <TextField label="Why keep separate?" value={why} onChange={setWhy} placeholder="e.g. New branch, different owner" error={tried && !why.trim() ? "Add a reason so the team knows these aren’t duplicates" : undefined} /> : null}
    </ModalFrame>
  );
}
