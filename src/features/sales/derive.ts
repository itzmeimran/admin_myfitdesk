import {
  CLOSED_LABEL,
  isClosedStage,
  type AttentionReason,
  type Lead,
  type LeadFilters,
  type Scope,
  type SalesUser,
  type SalesUserId,
} from "./model";

/**
 * Pure derivations over a list of leads: the "needs attention" rules, the
 * card flag line, filtering and the pipeline summary. No React, no I/O.
 *
 * These rules are the product spec for the screens. When the data moves to the
 * database, `attentionReasons` is the thing to reproduce as SQL (see
 * docs/sales-crm-handoff.md) — the UI should end up consuming a server-computed
 * `attention` array rather than re-deriving it.
 */

/** Why a lead is on the "Needs attention" list (empty = it isn't). Closed and converted leads never are. */
export function attentionReasons(l: Lead): AttentionReason[] {
  if (isClosedStage(l.stage) || l.stage === "converted") return [];
  const out: AttentionReason[] = [];
  if (l.next?.due === "overdue") out.push("overdue");
  if (l.stage === "demo_req" && l.demo?.status === "Awaiting confirmation") out.push("demo");
  if (l.trial && l.stage === "trial" && l.trial.endsInDays <= 3) out.push("trial");
  if (l.lastContactedDays >= 7) out.push("stale");
  return out;
}

export type FlagTone = { label: string; text: string; dot: string };

const TEXT = { rust: "text-accent", ink: "text-ink", mute: "text-mute" };
const DOT = { rust: "bg-accent", amber: "bg-hi", ink: "bg-ink", off: "bg-[#a99d91]" };

/** The single most important line on a lead card — highest-priority state wins. */
export function flagOf(l: Lead): FlagTone | null {
  const short = (when: string) => when.replace(" · ", ", ");
  if (l.conversion) return { label: `Account · ${l.conversion.account}`, text: TEXT.ink, dot: DOT.ink };
  if (isClosedStage(l.stage)) return { label: CLOSED_LABEL[l.stage] + (l.lostReason ? ` · ${l.lostReason}` : ""), text: TEXT.mute, dot: DOT.off };
  if (l.next?.due === "overdue") return { label: `Follow-up overdue · ${l.next.label}`, text: TEXT.rust, dot: DOT.rust };
  if (l.stage === "demo_req" && l.demo) return { label: `${l.demo.suggested ? "Suggested" : "Demo requested"} · ${short(l.demo.when)}`, text: TEXT.ink, dot: DOT.amber };
  if (l.stage === "demo_sched" && l.demo) return { label: `Demo · ${short(l.demo.when)}`, text: TEXT.ink, dot: DOT.ink };
  if (l.stage === "trial" && l.trial) {
    return l.trial.endsInDays <= 3
      ? { label: `Trial ends in ${l.trial.endsInDays} days`, text: TEXT.ink, dot: DOT.rust }
      : { label: `Trial · ends ${l.trial.end}`, text: TEXT.ink, dot: DOT.ink };
  }
  if (l.lastContactedDays >= 7) return { label: `No activity · ${l.lastContactedDays} days`, text: TEXT.mute, dot: DOT.off };
  if (l.next?.due === "today") return { label: "Follow-up today", text: TEXT.ink, dot: DOT.amber };
  return null;
}

/** Visibility: admin sees all, a manager their team, a rep only their own. */
export function inScope(l: Lead, scope: Scope, team: string, meId: SalesUserId, users: Record<SalesUserId, SalesUser>): boolean {
  if (scope === "all") return true;
  if (scope === "team") return users[l.owner]?.team === team;
  return l.owner === meId;
}

export function countActiveFilters(f: LeadFilters): number {
  return Object.values(f).filter(Boolean).length;
}

export function matchesFilters(l: Lead, f: LeadFilters, query: string, attentionOnly: boolean): boolean {
  const q = query.trim().toLowerCase();
  if (f.owner && l.owner !== f.owner) return false;
  if (f.stage && l.stage !== f.stage) return false;
  if (f.source && l.source !== f.source) return false;
  if (f.state && (l.state || "Unspecified") !== f.state) return false;
  if (f.city && (l.city || "Unspecified") !== f.city) return false;
  if (f.area && !(l.area || "Unspecified").toLowerCase().includes(f.area.toLowerCase())) return false;
  if (f.pin && !(l.pin || "Unspecified").startsWith(f.pin)) return false;
  if (f.priority && l.priority !== "high") return false;
  if (f.followUp && (f.followUp === "none" ? l.next !== null : l.next?.due !== f.followUp)) return false;
  if (f.demo) {
    const ok = f.demo === "requested" ? l.stage === "demo_req" : l.demo?.status.toLowerCase() === f.demo;
    if (!ok) return false;
  }
  if (f.trial && !(l.stage === "trial" && l.trial && (f.trial === "active" || l.trial.endsInDays <= 3))) return false;
  if (f.range && l.ageDays > Number(f.range)) return false;
  if (q) {
    const hay = [l.gym, l.contact, l.email].join(" ").toLowerCase();
    const phoneQuery=q.replace(/\D/g, '');
    if (!hay.includes(q) && (!phoneQuery || !l.phone.replace(/\D/g, '').includes(phoneQuery))) return false;
  }
  if (attentionOnly && attentionReasons(l).length === 0) return false;
  return true;
}

export type SummaryTile = { label: string; value: string | number; tone: "ink" | "rust" };

export function pipelineSummary(scoped: Lead[]): SummaryTile[] {
  const due = scoped.filter((l) => l.next && (l.next.due === "overdue" || l.next.due === "today") && !isClosedStage(l.stage) && l.stage !== "converted");
  const converted = scoped.filter((l) => l.stage === "converted").length;
  return [
    { label: "Total leads", value: scoped.length, tone: "ink" },
    { label: "New", value: scoped.filter((l) => l.stage === "new").length, tone: "ink" },
    { label: "Follow-ups due", value: due.length, tone: due.some((l) => l.next?.due === "overdue") ? "rust" : "ink" },
    { label: "Demos scheduled", value: scoped.filter((l) => l.stage === "demo_sched").length, tone: "ink" },
    { label: "Active trials", value: scoped.filter((l) => l.stage === "trial").length, tone: "ink" },
    { label: "Converted", value: converted, tone: "ink" },
    { label: "Conversion", value: scoped.length ? `${Math.round((converted / scoped.length) * 100)}%` : "—", tone: "ink" },
  ];
}

export type AttentionGroup = {
  reason: AttentionReason;
  title: string;
  hint: string;
  dot: string;
  leads: Lead[];
};

const GROUPS: { reason: AttentionReason; title: string; hint: string; dot: string }[] = [
  { reason: "overdue", title: "Follow-ups overdue", hint: "Past the scheduled date", dot: DOT.rust },
  { reason: "demo", title: "Demos awaiting confirmation", hint: "Requested from the website", dot: DOT.amber },
  { reason: "trial", title: "Trials ending soon", hint: "Within 3 days", dot: DOT.amber },
  { reason: "stale", title: "No recent activity", hint: "No calls, messages or notes in 7+ days", dot: DOT.off },
];

export function attentionGroups(leads: Lead[]): AttentionGroup[] {
  return GROUPS.map((g) => ({ ...g, leads: leads.filter((l) => attentionReasons(l).includes(g.reason)) })).filter((g) => g.leads.length > 0);
}

/** Pre-formatted detail line + button label for one row of a given attention group. */
export function attentionRow(l: Lead, reason: AttentionReason): { detail: string; cta: string; urgent: boolean } {
  switch (reason) {
    case "overdue": return { detail: `${l.next?.type} was due ${l.next?.label}`, cta: "Log follow-up", urgent: true };
    case "demo": return { detail: `Preferred ${l.demo?.when}`, cta: "Confirm demo", urgent: false };
    case "trial": return { detail: `Trial ends ${l.trial?.end} · in ${l.trial?.endsInDays} days`, cta: "Open lead", urgent: false };
    case "stale": return { detail: `Last contacted ${l.lastContacted}`, cta: "Log activity", urgent: false };
  }
}
