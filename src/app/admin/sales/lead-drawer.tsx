"use client";

import type { IconType } from "react-icons";
import {
  LuArrowLeft, LuArrowRightLeft, LuCalendar, LuCheck, LuClock, LuGitMerge, LuMail, LuMessageCircle, LuPhone, LuPlay, LuPlus,
  LuStickyNote, LuTriangleAlert, LuUser, LuUsers, LuX, LuLock,
} from "react-icons/lu";
import { Button } from "@/components/Button";
import { TabsNav } from "@/components/Tabs";
import { Dropdown } from "@/components/Dropdown";
import { CLOSED_LABEL, STAGE_LABEL, STAGE_OPTIONS, formatPhone, isClosedStage, type ActivityKind, type DemoStatus, type Lead } from "@/features/sales/model";
import { useSalesCrm, type DrawerTab } from "@/features/sales/use-sales-crm";
import { Chip, OwnerBadge } from "./crm-ui";
import { CalendarIcon, ConfirmIcon, DetailsIcon, MoreIcon, RestoreIcon } from '@/core/ui/icons';
import { iconForAction } from '@/core/ui/action-icons';

const KIND_ICON: Record<ActivityKind, IconType> = {
  created: LuPlus, assign: LuUser, call: LuPhone, whatsapp: LuMessageCircle, email: LuMail, meeting: LuUsers, note: LuStickyNote,
  demo: LuCalendar, clock: LuClock, trial: LuPlay, check: LuCheck, x: LuX, swap: LuArrowRightLeft, warn: LuTriangleAlert, merge: LuGitMerge,
};
const KIND_TONE = (k: ActivityKind) =>
  k === "check" || k === "merge" ? "border-ink bg-ink text-hi" : k === "warn" ? "border-ink bg-sand text-ink" : k === "x" ? "border-line bg-sand text-mute" : "border-line bg-paper text-ink";

const DEMO_TONE: Record<DemoStatus, string> = {
  "Awaiting confirmation": "bg-hi text-ink", Scheduled: "bg-ink text-hi", Rescheduled: "bg-ink text-hi",
  Completed: "bg-sand text-ink", "No show": "bg-sand text-accent", Cancelled: "bg-sand text-mute",
};

const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
  { key: "follow", label: "Follow-ups" },
];

const H3 = "border-b border-line pb-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute";
const DT = "text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute2";

export function LeadDrawer() {
  const crm = useSalesCrm();
  const lead = crm.openId !== null ? crm.getLead(crm.openId) : undefined;
  if (!lead) return null;
  return <Drawer lead={lead} />;
}

function Drawer({ lead: l }: { lead: Lead }) {
  const crm = useSalesCrm();
  const { commands } = crm;
  const owner = crm.users[l.owner];
  const closed = isClosedStage(l.stage);
  const converted = l.stage === "converted";
  const canReassign = crm.role === "admin" || (crm.role === "manager" && owner.team === crm.me.team);
  const existing = l.duplicateOf !== null ? crm.getLead(l.duplicateOf) : undefined;
  const open = (m: Parameters<typeof crm.openModal>[0]) => () => crm.openModal(m);

  const actions: { label: string; act: () => void; primary?: boolean }[] =
    l.stage === "demo_req"
      ? [
          { label: "Confirm demo", act: open({ kind: "demo", id: l.id, variant: "confirm" }), primary: true },
          { label: "Suggest another time", act: open({ kind: "demo", id: l.id, variant: "suggest" }) },
          { label: "Log activity", act: open({ kind: "activity", id: l.id, tab: "log" }) },
        ]
      : converted || closed
        ? [{ label: "Log activity", act: open({ kind: "activity", id: l.id, tab: "log" }), primary: true }]
        : [
            { label: "Log activity", act: open({ kind: "activity", id: l.id, tab: "log" }), primary: true },
            { label: "Schedule follow-up", act: open({ kind: "activity", id: l.id, tab: "followup" }) },
          ];

  const moreLinks: { label: string; act: () => void; disabled?: boolean; note?: string }[] = [
    { label: "Reassign", act: open({ kind: "reassign", id: l.id }), disabled: !canReassign, note: canReassign ? "" : "Only a manager or admin can reassign this lead" },
    { label: l.priority === "high" ? "Remove high priority" : "Mark high priority", act: () => commands.togglePriority(l.id) },
    ...(converted || closed ? [] : [{ label: l.organizationId?'Confirm paid conversion':'Create / link gym', act: () => commands.moveLead(l.id, "converted") }]),
    ...(closed || converted ? [] : [{ label: "Mark lost / not interested", act: open({ kind: "lost", id: l.id, outcome: "Lost" }) }]),
  ];

  const contactLinks = [
    { label: "Call", href: `tel:${l.phone}`, Icon: LuPhone, aria: `Call ${l.contact}` },
    { label: "WhatsApp", href: `https://wa.me/${l.phone.replace(/\D/g, '')}`, Icon: LuMessageCircle, aria: `WhatsApp ${l.contact}` },
    ...(l.email?[{ label: "Email", href: `mailto:${l.email}`, Icon: LuMail, aria: `Email ${l.contact}` }]:[]),
  ];

  const stageChip = converted ? "ink" : closed ? "sand" : "outline";
  const primary = actions[0];

  return (
    <>
      <Button type="button" variant="ghost" layout="overlay" size="custom" aria-label="Close lead" onClick={crm.closeDrawer} className="fade-in fixed inset-0 z-40 cursor-default bg-ink/30" />
      <aside role="dialog" aria-modal="true" aria-label={l.gym}
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full flex-col bg-paper md:w-[560px] md:border-l-[1.5px] md:border-ink lg:w-[500px]">
        <div className="flex flex-shrink-0 flex-col gap-3 border-b-[1.5px] border-ink px-4 pt-3.5 md:px-[22px] md:pt-[18px]">
          <div className="flex items-start gap-2.5">
            <Button type="button" variant="ghost" size="md" iconOnly aria-label="Close" onClick={crm.closeDrawer} className="-ml-2.5 -mt-1.5 h-11 w-11">
              <LuArrowLeft size={20} aria-hidden className="md:hidden" />
              <LuX size={20} aria-hidden className="hidden md:block" />
            </Button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="font-display text-[21px] leading-[1.15] tracking-[-0.02em]">{l.gym}</h2>
              <span className="text-[12.5px] text-mute">{[l.area, l.city, l.state, l.pin].join(", ")}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={stageChip}>{STAGE_LABEL[l.stage]}</Chip>
            {l.conversion ? <Chip tone="mute">Account · {l.conversion.account}</Chip> : null}
            {l.priority === "high" ? <Chip tone="accent">High priority</Chip> : null}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] text-mute"><OwnerBadge user={owner} size={22} />{owner.name}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {contactLinks.map(({ label, href, Icon, aria }) => (
              <a key={label} href={href} aria-label={aria} className="flex min-h-[40px] items-center justify-center gap-[7px] border-[1.5px] border-line text-[12px] font-bold text-ink hover:border-ink hover:bg-sand hover:text-ink">
                <Icon size={15} aria-hidden />{label}
              </a>
            ))}
          </div>

          {l.possibleDuplicate || existing ? (
            <div className="flex flex-wrap items-center gap-2.5 border-[1.5px] border-ink bg-sand px-3 py-2.5">
              <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-bold">Possible existing lead</span>
                <span className="text-[12px] text-mute">{existing ? `Phone or email matches ${existing.gym} · ${STAGE_LABEL[existing.stage]} since ${existing.createdOn} · ${crm.users[existing.owner]?.name ?? 'Previous salesperson'}` : 'Possible phone or email match. A platform owner can review matches outside your scope.'}</span>
              </span>
              <Button icon={DetailsIcon} type="button" variant="primary" size="sm" onClick={open({ kind: "duplicate", id: l.id })}>Review match</Button>
            </div>
          ) : null}

          <div className="hidden flex-col gap-3 md:flex">
            <div className="flex flex-wrap items-center gap-1.5">
              {actions.map((a) => <Button icon={iconForAction(a.label)} key={a.label} type="button" variant={a.primary ? "primary" : "secondary"} size="sm" onClick={a.act} className="border-ink">{a.label}</Button>)}
              <div className="ml-auto w-[170px]">
                <Dropdown ariaLabel="Move to stage" size="sm" value={l.stage} onChange={(v) => commands.moveLead(l.id, v as Lead["stage"])} options={STAGE_OPTIONS} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1">
              {moreLinks.map((m) => (
                <Button key={m.label} type="button" variant="text" size="custom" disabled={m.disabled} title={m.note} onClick={m.act}
                  className={`min-h-[30px] text-[12.5px] font-bold ${m.disabled ? "text-[#a99d91]" : "text-ink"}`}>{m.label}</Button>
              ))}
            </div>
          </div>

          <TabsNav
            variant="segmented"
            fill
            size="sm"
            ariaLabel="Lead sections"
            activeKey={crm.drawerTab}
            onSelect={(key) => crm.setDrawerTab(key as typeof crm.drawerTab)}
            items={DRAWER_TABS.map((t) => ({ key: t.key, label: t.label }))}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-[22px]">
          {crm.drawerTab === "overview" ? <OverviewTab lead={l} owner={owner.name} canReassign={canReassign} /> : null}
          {crm.drawerTab === "activity" ? <ActivityTab lead={l} /> : null}
          {crm.drawerTab === "follow" ? <FollowUpTab lead={l} /> : null}
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t-[1.5px] border-ink bg-paper px-4 py-2.5 md:hidden">
          <Button icon={iconForAction(primary.label)} type="button" variant="primary" size="lg" onClick={primary.act} className="min-h-[48px] flex-1">{primary.label}</Button>
          <Button icon={MoreIcon} type="button" variant="secondary" size="lg" aria-haspopup="dialog" onClick={open({ kind: "more", id: l.id })} className="min-h-[48px] border-ink px-[18px]">More</Button>
        </div>
      </aside>
    </>
  );
}

function KV({ k, v, rust }: { k: string; v: string; rust?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={DT}>{k}</dt>
      <dd className={`text-[13.5px] font-medium [overflow-wrap:anywhere] ${rust ? "text-accent" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

function OverviewTab({ lead: l, owner, canReassign }: { lead: Lead; owner: string; canReassign: boolean }) {
  const crm = useSalesCrm();
  const { commands } = crm;
  const d = l.demo;
  const first = l.contact.split(" ")[0];
  const closed = isClosedStage(l.stage);
  const demoActs: { label: string; act: () => void; primary?: boolean }[] = !d ? [] :
    d.status === "Awaiting confirmation" ? [
      { label: "Confirm", act: () => crm.openModal({ kind: "demo", id: l.id, variant: "confirm" }), primary: true },
      { label: "Suggest another time", act: () => crm.openModal({ kind: "demo", id: l.id, variant: "suggest" }) },
    ] : d.status === "Scheduled" || d.status === "Rescheduled" ? [
      { label: "Mark completed", act: () => commands.setDemoStatus(l.id, "Completed"), primary: true },
      { label: "No show", act: () => commands.setDemoStatus(l.id, "No show") },
      { label: "Reschedule", act: () => crm.openModal({ kind: "demo", id: l.id, variant: "reschedule" }) },
      { label: "Cancel", act: () => commands.setDemoStatus(l.id, "Cancelled") },
    ] : d.status === "No show" || d.status === "Cancelled" ? [
      { label: "Reschedule", act: () => crm.openModal({ kind: "demo", id: l.id, variant: "reschedule" }), primary: true },
    ] : [];
  const demoNote: Record<DemoStatus, string> = {
    "Awaiting confirmation": d?.suggested ? `You suggested this time. Waiting for ${first} to reply.` : "Requested on the website. Not confirmed yet.",
    Scheduled: `Confirmed with ${first}.`, Rescheduled: "Moved to a new time and confirmed.", Completed: "Demo done.",
    "No show": "The owner didn’t join. Reschedule if they’re still interested.", Cancelled: "Cancelled. Reschedule if needed.",
  };

  const sales: [string, string, boolean?][] = [
    ["Stage", STAGE_LABEL[l.stage]], ["Assigned to", owner], ["Priority", l.priority === "high" ? "High" : "Normal", l.priority === "high"],
    ["Last contacted", l.lastContacted],
    ["Next follow-up", l.conversion ? "Stopped · converted" : l.next ? `${l.next.label} · ${l.next.type}` : "—", l.next?.due === "overdue"],
    ...(l.trial ? ([["Trial start", l.trial.start], ["Trial end", l.trial.end, l.trial.endsInDays <= 3 && l.stage === "trial"]] as [string, string, boolean?][]) : []),
    ["Expected plan", l.expectedPlan],
    ...(l.conversion ? ([["Converted date", l.conversion.date]] as [string, string][]) : []),
    ...(l.lostReason ? ([[l.stage === "lost" ? "Lost reason" : "Reason", l.lostReason]] as [string, string][]) : []),
  ];
  const gym: [string, string][] = [
    ["Contact person", l.contact], ["Phone / WhatsApp", formatPhone(l.phone)], ["Email", l.email], ["Area", l.area], ["City", l.city],
    ["State", l.state], ["PIN code", l.pin], ["Branches", l.branches], ["Members (approx.)", l.members], ["Current software", l.software],
    ["Lead source", l.source], ["Created", l.createdOn],
  ];
  const history = [...(crm.assignments[l.id] ?? [])].reverse();

  return (
    <div className="flex flex-col gap-4">
      {d ? (
        <section aria-label="Demo" className="flex flex-col gap-2.5 border-[1.5px] border-ink px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Demo</span>
            <span className={`px-[7px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.08em] ${DEMO_TONE[d.status]}`}>{d.status}</span>
          </div>
          <span className="text-[16px] font-bold">{d.when}</span>
          <span className="text-[12px] text-mute">{demoNote[d.status]}</span>
          {demoActs.length ? (
            <div className="flex flex-wrap gap-1.5">
              {demoActs.map((a) => <Button icon={iconForAction(a.label)} key={a.label} type="button" variant={a.primary ? "primary" : "secondary"} size="sm" onClick={a.act} className="border-ink">{a.label}</Button>)}
            </div>
          ) : null}
        </section>
      ) : null}

      {l.conversion ? (
        <section aria-label="Conversion" className="flex flex-col border-[1.5px] border-ink">
          <div className="flex items-center gap-2 bg-ink px-3.5 py-2.5 text-paper">
            <LuCheck size={15} className="text-hi" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.13em]">Converted · linked to MyFitDesk</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 px-3.5 py-3">
            {([["Converted date", l.conversion.date], ["Expected plan", l.conversion.plan], ["MyFitDesk gym", l.conversion.org], ["Account status", l.conversion.account], ["Subscription", l.conversion.subscription], ["Converted by", l.conversion.by]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col gap-0.5"><dt className={DT}>{k}</dt><dd className="text-[13px] font-bold">{v}</dd></div>
            ))}
          </dl>
          <span className="border-t border-line px-3.5 py-2.5 text-[12px] text-mute">Sales follow-up reminders stopped on conversion. Earlier activity stays below.</span>
        </section>
      ) : null}

      {closed ? (
        <section aria-label="Outcome" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-[1.5px] border-line bg-sand px-3.5 py-3">
          <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-bold">{CLOSED_LABEL[l.stage as keyof typeof CLOSED_LABEL]}{l.lostReason ? ` · ${l.lostReason}` : ""}</span>
            <span className="text-[12px] text-mute">{l.stage === "later" && l.next ? `Revisit on ${l.next.label}.${l.note ? ` ${l.note}` : ""}` : l.note || "No notes added."}</span>
          </span>
          <Button icon={RestoreIcon} type="button" variant="secondary" size="sm" onClick={() => commands.reopen(l.id)} className="border-ink">Reopen lead</Button>
        </section>
      ) : null}

      {([["Sales", sales], ["Gym & contact", gym]] as [string, [string, string, boolean?][]][]).map(([title, rows]) => (
        <section key={title} aria-label={title} className="flex flex-col gap-2.5">
          <h3 className={H3}>{title}</h3>
          <dl className="grid grid-cols-2 gap-x-3.5 gap-y-3">{rows.map(([k, v, rust]) => <KV key={k} k={k} v={v} rust={rust} />)}</dl>
        </section>
      ))}

      <section aria-label="Assignment history" className="flex flex-col gap-2.5">
        <div className="flex items-center border-b border-line pb-2">
          <h3 className="mr-auto text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute">Assignment history</h3>
          <Button type="button" variant="text" size="custom" disabled={!canReassign} onClick={() => crm.openModal({ kind: "reassign", id: l.id })}
            className={`min-h-[30px] text-[12px] font-bold ${canReassign ? "text-accent" : "text-[#a99d91]"}`}>
            {!canReassign ? <LuLock size={12} aria-hidden /> : null}Reassign
          </Button>
        </div>
        {history.map((h, i) => (
          <div key={i} className="flex justify-between gap-2.5 text-[13px]"><span className="font-bold">{h.text}</span><span className="whitespace-nowrap text-mute2">{h.meta}</span></div>
        ))}
      </section>
    </div>
  );
}

function ActivityTab({ lead: l }: { lead: Lead }) {
  const crm = useSalesCrm();
  const items = crm.activities[l.id] ?? [];
  return (
    <div className="flex flex-col gap-3.5">
      <Button icon={LuPlus} type="button" variant="secondary" layout="control" size="custom" onClick={() => crm.openModal({ kind: "activity", id: l.id, tab: "log" })}
        className="min-h-[46px] justify-start gap-2.5 border-[1.5px] border-dashed border-mute3 px-3.5 text-[13px] font-normal text-mute hover:bg-sand">
        Log a call, WhatsApp, email or note
      </Button>
      <ol className="flex flex-col">
        {items.map((a) => {
          const Icon = KIND_ICON[a.kind] ?? LuStickyNote;
          return (
            <li key={a.id} className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-3 pb-4">
              <span aria-hidden className="absolute bottom-0 left-3.5 top-[30px] w-[1.5px] bg-line" />
              <span aria-hidden className={`relative flex h-[30px] w-[30px] items-center justify-center border-[1.5px] ${KIND_TONE(a.kind)}`}><Icon size={14} /></span>
              <span className="flex min-w-0 flex-col gap-[3px] pt-1">
                <span className="text-[13.5px] font-bold">{a.title}</span>
                <span className="text-[11.5px] text-mute2">{a.by} · {a.date} · {a.time}</span>
                {a.note ? <span className="mt-[3px] bg-sand px-2.5 py-2 text-[12.5px] leading-normal text-inkline">{a.note}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FollowUpTab({ lead: l }: { lead: Lead }) {
  const crm = useSalesCrm();
  const items = crm.followUps[l.id] ?? [];
  const converted = l.stage === "converted";
  const closed = isClosedStage(l.stage);
  const meta = (s: string) => ({ done: ["Done", "text-mute"], overdue: ["Overdue", "text-accent"], today: ["Today", "text-ink"], stopped: ["Stopped", "text-mute"], upcoming: ["Upcoming", "text-mute2"] })[s] ?? ["", ""];
  return (
    <div className="flex flex-col gap-3">
      {converted || closed ? (
        <div className="border-[1.5px] border-line bg-sand px-3 py-2.5 text-[12.5px] text-mute">
          {converted ? "Follow-up reminders stopped when this lead converted." : "This lead is closed, so no reminders are sent. Reopen it to schedule follow-ups."}
        </div>
      ) : (
        <Button icon={CalendarIcon} type="button" variant="primary" size="lg" onClick={() => crm.openModal({ kind: "activity", id: l.id, tab: "followup" })}>Schedule follow-up</Button>
      )}
      {items.length === 0 ? <div className="border-[1.5px] border-dashed border-line p-5 text-center text-[12.5px] text-mute2">No follow-ups yet.</div> : null}
      {items.map((f) => {
        const [label, tone] = meta(f.status);
        const inactive = f.status === "done" || f.status === "stopped";
        return (
          <div key={f.id} className={`flex items-center gap-3 border-[1.5px] px-3 py-2.5 ${f.status === "overdue" ? "border-accent" : "border-line"}`}>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`text-[13.5px] font-bold ${inactive ? "line-through" : ""}`}>{f.type} · {f.when}</span>
                <span className={`text-[10.5px] font-bold uppercase tracking-[0.08em] ${tone}`}>{label}</span>
              </span>
              {f.note ? <span className="text-[12px] text-mute">{f.note}</span> : null}
            </span>
            {!inactive ? <Button icon={ConfirmIcon} type="button" variant="secondary" size="sm" onClick={() => crm.commands.completeFollowUp(l.id, f.id)} className="flex-shrink-0 border-ink">Mark done</Button> : null}
          </div>
        );
      })}
    </div>
  );
}
