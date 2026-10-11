/**
 * Pure rules behind the gym Overview: which issues need attention, how a
 * WhatsApp sender is described, when a background signal may be called healthy,
 * and how member counts are reconciled. No I/O and no `server-only` import, so
 * the page and `scripts/gym-overview.test.cjs` share one implementation.
 */

export type IssueSeverity = "critical" | "warning";

export type AttentionItem = {
  id: string;
  severity: IssueSeverity;
  title: string;
  detail: string;
  action: { label: string; href: string };
};

const n = (value: number) => value.toLocaleString("en-IN");
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// ─── WhatsApp sender + status ────────────────────────────────────────────────

export type WhatsAppFacts = {
  /** whatsapp_integrations.status for the gym's OWN number (null = no row). */
  connectionStatus: string | null;
  connectionError: string | null;
  /** sender_mode of the gym's most recent outbound message. */
  lastSenderMode: string | null;
  balance: number;
  lowCreditThreshold: number | null;
  failedMonth: number;
  stuckCount: number;
  paused: boolean;
  /** Failure rate over 30 days, 0-100, null when nothing was sent. */
  failureRate: number | null;
  sent30d: number;
  lastSuccessAt: string | null;
};

export type SenderKind = "own" | "managed";

/**
 * Which sender the gym's messages leave from. A connected own number wins;
 * otherwise MyFitDesk's managed sender is the default for every gym, so a gym
 * that never connected its own number is NOT "disconnected".
 */
export function resolveSender(facts: Pick<WhatsAppFacts, "connectionStatus" | "lastSenderMode">): {
  kind: SenderKind;
  label: string;
} {
  if (facts.connectionStatus === "connected") return { kind: "own", label: "Gym's own number" };
  if (facts.lastSenderMode === "own_waba" && facts.connectionStatus !== null) return { kind: "own", label: "Gym's own number" };
  return { kind: "managed", label: "MyFitDesk managed sender" };
}

export type WhatsAppState = "attention" | "working" | "idle" | "unused";

export type WhatsAppStatus = {
  state: WhatsAppState;
  label: string;
  sender: { kind: SenderKind; label: string };
};

const DAY_MS = 86_400_000;
const ageDays = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / DAY_MS : null);

/** "Working" needs recent delivery evidence; silence is never reported as health. */
export function deriveWhatsAppStatus(facts: WhatsAppFacts, now: Date): WhatsAppStatus {
  const sender = resolveSender(facts);
  const problems =
    facts.paused ||
    facts.balance === 0 ||
    facts.stuckCount > 0 ||
    (facts.connectionStatus === "error" && sender.kind === "own") ||
    (facts.connectionStatus === "disconnected" && sender.kind === "own") ||
    (facts.failureRate !== null && facts.failureRate >= 25 && facts.sent30d >= 5);
  if (problems) return { state: "attention", label: "Needs attention", sender };

  const lastSuccessAge = ageDays(facts.lastSuccessAt, now);
  if (lastSuccessAge === null) return { state: "unused", label: "No messages delivered yet", sender };
  if (lastSuccessAge <= 7) return { state: "working", label: "Delivering", sender };
  return { state: "idle", label: "No recent deliveries", sender };
}

// ─── Honest background-signal health ────────────────────────────────────────

export type HealthState = "healthy" | "attention" | "none_due" | "not_configured" | "unknown";

export type HealthEvidence = {
  /** true / false when known, null when the system cannot tell. */
  configured: boolean | null;
  /** Whether the system records runs for this signal at all. */
  tracked: boolean;
  failuresRecent: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  /** Runs on a fixed cadence (hours between runs); null = triggered by events. */
  cadenceHours: number | null;
  /** Something is scheduled to run in the future. */
  hasUpcoming: boolean;
};

export const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  attention: "Needs attention",
  none_due: "No runs due",
  not_configured: "Not configured",
  unknown: "Unknown",
};

/**
 * An old successful run alone never proves current health, and missing
 * tracking data is never read as "zero failures".
 */
export function classifyHealth(e: HealthEvidence, now: Date): { state: HealthState; reason: string } {
  if (e.configured === false) return { state: "not_configured", reason: "Not set up for this gym." };
  if (!e.tracked) return { state: "unknown", reason: "This signal is not tracked, so its health cannot be confirmed." };
  if (e.failuresRecent > 0) {
    return { state: "attention", reason: `${n(e.failuresRecent)} ${plural(e.failuresRecent, "failure", "failures")} recorded recently.` };
  }
  const lastRunAge = ageDays(e.lastRunAt ?? e.lastSuccessAt, now);
  if (e.cadenceHours !== null) {
    if (lastRunAge === null) return { state: "unknown", reason: "No run has been recorded yet." };
    if (lastRunAge * 24 > e.cadenceHours * 1.5) {
      return { state: "attention", reason: `Last ran ${Math.floor(lastRunAge)} days ago, later than its ${e.cadenceHours}-hour schedule allows.` };
    }
    return { state: "healthy", reason: "Ran on schedule with no failures recorded." };
  }
  // Event-driven: nothing is expected on a clock.
  if (lastRunAge === null) {
    return e.hasUpcoming
      ? { state: "none_due", reason: "Nothing has run yet; a run is scheduled." }
      : { state: "none_due", reason: "Nothing has run and nothing is scheduled." };
  }
  if (lastRunAge <= 7) return { state: "healthy", reason: "Ran recently with no failures recorded." };
  return { state: "none_due", reason: "No recent runs. An older success does not show current health." };
}

// ─── Member counts ──────────────────────────────────────────────────────────

export type MemberCountFacts = {
  total: number;
  /** People (not subscription rows) with a current, expiring or frozen membership. */
  active: number;
  expiringSoon: number;
  expired: number;
  noPlan: number;
  newThisMonth: number;
};

/**
 * `active` counts distinct members, so it can never exceed `total`. If it
 * does, the inputs came from different definitions; report that instead of
 * clamping the number to hide it.
 */
export function checkMemberCounts(c: MemberCountFacts): { consistent: boolean; problem: string | null } {
  if (c.active > c.total) {
    return { consistent: false, problem: `Active (${n(c.active)}) is higher than total members (${n(c.total)}).` };
  }
  if (c.expiringSoon > c.active) {
    return { consistent: false, problem: `Expiring soon (${n(c.expiringSoon)}) is higher than active (${n(c.active)}).` };
  }
  return { consistent: true, problem: null };
}

// ─── Needs attention ────────────────────────────────────────────────────────

export type AttentionFacts = {
  gymId: string;
  now: Date;
  suspended: boolean;
  /** Days until the subscription period ends; negative = overdue; null = none. */
  daysToExpiry: number | null;
  subscriptionLabel: string; // "Trial" or "Subscription"
  hasQueuedPackage: boolean;
  whatsapp: WhatsAppFacts | null;
  restrictions: string[];
  jobsFailed: number;
  jobsDegraded: number;
  reconciliationIssues: number;
  reconciliationCritical: number;
  openAlerts: number;
  criticalAlerts: number;
  dataHealthIssues: number;
  ownerLastActiveAt: string | null;
  ownerNeverSignedIn: boolean;
  gymAgeDays: number;
  usage: Array<{ label: string; used: number; cap: number | null }>;
};

const RANK: Record<IssueSeverity, number> = { critical: 0, warning: 1 };

export function buildAttentionItems(f: AttentionFacts): AttentionItem[] {
  const base = `/admin/gyms/${f.gymId}`;
  const ops = (section: string) => `${base}/operations?section=${section}`;
  const items: AttentionItem[] = [];
  const add = (item: AttentionItem) => items.push(item);

  if (f.suspended) {
    add({
      id: "suspended",
      severity: "critical",
      title: "Gym is suspended",
      detail: "Billing is unaffected. Reactivate it from the header actions when ready.",
      action: { label: "Review restrictions", href: ops("locks") },
    });
  }
  if (f.restrictions.length) {
    add({
      id: "restrictions",
      severity: "warning",
      title: `${f.restrictions.length} ${plural(f.restrictions.length, "restriction", "restrictions")} active`,
      detail: f.restrictions.join(" · "),
      action: { label: "Manage restrictions", href: ops("locks") },
    });
  }

  if (f.daysToExpiry !== null && f.daysToExpiry < 0) {
    const days = Math.abs(f.daysToExpiry);
    add({
      id: "subscription-overdue",
      severity: "critical",
      title: `${f.subscriptionLabel} ended ${n(days)} ${plural(days, "day", "days")} ago`,
      detail: f.hasQueuedPackage ? "A package is queued and starts when the current period rolls over." : "No active period covers today.",
      action: { label: "Manage subscription", href: `${base}/billing` },
    });
  } else if (f.daysToExpiry !== null && f.daysToExpiry <= 7 && !f.hasQueuedPackage) {
    add({
      id: "subscription-ending",
      severity: "warning",
      title: f.daysToExpiry === 0 ? `${f.subscriptionLabel} ends today` : `${f.subscriptionLabel} ends in ${n(f.daysToExpiry)} ${plural(f.daysToExpiry, "day", "days")}`,
      detail: "Nothing is queued to follow it.",
      action: { label: "Manage subscription", href: `${base}/billing` },
    });
  }

  const wa = f.whatsapp;
  if (wa) {
    const sender = resolveSender(wa);
    if (wa.paused) {
      add({
        id: "wa-paused",
        severity: "critical",
        title: "WhatsApp sending is paused",
        detail: "An admin paused this gym's messages. Nothing is being sent.",
        action: { label: "View WhatsApp controls", href: ops("whatsapp") },
      });
    }
    if (wa.connectionStatus === "error" && sender.kind === "own") {
      add({
        id: "wa-own-error",
        severity: "critical",
        title: "The gym's own WhatsApp number has an error",
        detail: wa.connectionError || "The connection reports an error.",
        action: { label: "View connection", href: ops("whatsapp") },
      });
    } else if (wa.connectionStatus === "disconnected" && sender.kind === "own") {
      add({
        id: "wa-own-disconnected",
        severity: "warning",
        title: "The gym's own WhatsApp number is disconnected",
        detail: "It was sending from its own number. Reconnect it, or it needs to fall back to the managed sender.",
        action: { label: "View connection", href: ops("whatsapp") },
      });
    } else if (wa.connectionStatus === "error" && sender.kind === "managed") {
      add({
        id: "wa-own-config",
        severity: "warning",
        title: "An unused own-number setup has an error",
        detail: `Messages still send from the MyFitDesk managed sender. ${wa.connectionError ?? ""}`.trim(),
        action: { label: "View connection", href: ops("whatsapp") },
      });
    }
    if (wa.balance === 0) {
      add({
        id: "wa-credits-zero",
        severity: "critical",
        title: "WhatsApp credits are used up",
        detail: "Credit-based messages cannot be sent until credits are added.",
        action: { label: "Manage credits", href: ops("whatsapp") },
      });
    } else if (wa.lowCreditThreshold !== null && wa.balance <= wa.lowCreditThreshold) {
      add({
        id: "wa-credits-low",
        severity: "warning",
        title: `Only ${n(wa.balance)} WhatsApp ${plural(wa.balance, "credit", "credits")} left`,
        detail: `At or below this gym's alert level of ${n(wa.lowCreditThreshold)}.`,
        action: { label: "Manage credits", href: ops("whatsapp") },
      });
    }
    if (wa.stuckCount > 0) {
      add({
        id: "wa-stuck",
        severity: "critical",
        title: `${n(wa.stuckCount)} ${plural(wa.stuckCount, "message looks", "messages look")} stuck in the queue`,
        detail: "Queued for over 15 minutes without being sent.",
        action: { label: "View queue", href: ops("jobs") },
      });
    }
    if (wa.failedMonth > 0) {
      const severe = wa.failureRate !== null && wa.failureRate >= 25 && wa.sent30d >= 5;
      add({
        id: "wa-failed",
        severity: severe ? "critical" : "warning",
        title: `${n(wa.failedMonth)} WhatsApp ${plural(wa.failedMonth, "message", "messages")} failed this month`,
        detail: wa.failureRate === null ? "Open the list for error codes." : `${wa.failureRate}% of recent sends failed.`,
        action: { label: "View failed messages", href: `${base}/whatsapp?status=failed` },
      });
    }
  }

  // Stuck messages are already one degraded queue job; don't count them twice.
  const jobsBad = Math.max(f.jobsFailed + f.jobsDegraded - (wa && wa.stuckCount > 0 ? 1 : 0), 0);
  if (jobsBad > 0) {
    add({
      id: "jobs",
      severity: f.jobsFailed > 0 ? "critical" : "warning",
      title: `${n(jobsBad)} background ${plural(jobsBad, "job needs", "jobs need")} attention`,
      detail: "Failed or degraded runs for reminders, campaigns or automations.",
      action: { label: "View jobs", href: ops("jobs") },
    });
  }

  if (f.reconciliationIssues > 0) {
    add({
      id: "reconciliation",
      severity: f.reconciliationCritical > 0 ? "critical" : "warning",
      title: `${n(f.reconciliationIssues)} payment ${plural(f.reconciliationIssues, "mismatch", "mismatches")} to review`,
      detail: "Payments and subscriptions disagree.",
      action: { label: "Open reconciliation", href: ops("reconciliation") },
    });
  }
  if (f.openAlerts > 0) {
    add({
      id: "alerts",
      severity: f.criticalAlerts > 0 ? "critical" : "warning",
      title: `${n(f.openAlerts)} open ${plural(f.openAlerts, "alert", "alerts")}`,
      detail: f.criticalAlerts > 0 ? `${n(f.criticalAlerts)} critical.` : "None are critical.",
      action: { label: "View alerts", href: ops("alerts") },
    });
  }
  if (f.dataHealthIssues > 0) {
    add({
      id: "data-health",
      severity: "warning",
      title: `${n(f.dataHealthIssues)} data-health ${plural(f.dataHealthIssues, "check is", "checks are")} failing`,
      detail: "Records look inconsistent.",
      action: { label: "View data health", href: ops("health") },
    });
  }

  for (const u of f.usage) {
    if (u.cap !== null && u.cap > 0 && u.used / u.cap >= 0.9) {
      const full = u.used >= u.cap;
      add({
        id: `cap-${u.label.toLowerCase()}`,
        severity: "warning",
        title: `${u.label} ${full ? "at" : "near"} the plan limit`,
        detail: `${n(u.used)} of ${n(u.cap)} used.`,
        action: { label: "Change package", href: `${base}/billing` },
      });
    }
  }

  if (f.ownerNeverSignedIn && f.gymAgeDays >= 3) {
    add({
      id: "owner-never",
      severity: "warning",
      title: "The owner has never signed in",
      detail: `The gym was created ${n(f.gymAgeDays)} days ago.`,
      action: { label: "View owner access", href: ops("access") },
    });
  } else if (f.ownerLastActiveAt) {
    const idle = Math.floor((f.now.getTime() - new Date(f.ownerLastActiveAt).getTime()) / DAY_MS);
    if (idle >= 14) {
      add({
        id: "owner-inactive",
        severity: "warning",
        title: `The owner has been inactive for ${n(idle)} days`,
        detail: "No sign-in or app activity in that time.",
        action: { label: "View owner access", href: ops("access") },
      });
    }
  }

  // Stable sort: severity first, then the order issues were added (importance).
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => RANK[a.item.severity] - RANK[b.item.severity] || a.index - b.index)
    .map(({ item }) => item);
}

// ─── Activity grouping check ────────────────────────────────────────────────

/**
 * Events are only combined by a shared business identifier (the database's
 * member UUID grouping); timestamps alone never merge anything.
 */
export function sharedGroupKey(event: { memberId: string | null; groupCount?: number }): string | null {
  return event.memberId && (event.groupCount ?? 1) > 1 ? event.memberId : null;
}

// ─── Contact links ──────────────────────────────────────────────────────────

/** `tel:` link from a stored phone, or null when it can't be dialled. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${cleaned.startsWith("+") ? "+" : ""}${digits}`;
}

/** `mailto:` link from a stored email, or null when it isn't an address. */
export function mailHref(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return `mailto:${value}`;
}
