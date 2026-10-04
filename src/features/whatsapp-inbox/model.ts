import type { Conversation, InboxFilter, Message, OutboundMessage } from "./types";

export const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "unassigned", label: "Unassigned" },
];

export function initials(name: string | null): string {
  return name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "#";
}

/** "Open" while the 24-hour reply window runs, "Window expired" after it, and
 * "Closed" once a person has closed the conversation. */
export type WindowState = "open" | "expired" | "closed";

export function windowState(c: Conversation): WindowState {
  if (c.status === "closed") return "closed";
  if (c.windowEndsAt !== undefined) return c.windowEndsAt && Date.parse(c.windowEndsAt) > Date.now() ? "open" : "expired";
  return c.windowLeft ? "open" : "expired";
}

export function windowRemaining(at: string | null, now = Date.now()): string | null {
  const minutes = at ? Math.ceil((Date.parse(at) - now) / 60000) : 0;
  return minutes > 0 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : null;
}

export const WINDOW_LABEL: Record<WindowState, string> = { open: "Open", expired: "Window expired", closed: "Closed" };

/** Dot colour per state — closed is a neutral grey, an expired window is the
 * highlight yellow because it needs a template to continue. */
export const WINDOW_DOT: Record<WindowState, string> = { open: "bg-ink", expired: "bg-hi", closed: "bg-[#c9bcab]" };

export function lastTextMessage(c: Conversation): Extract<Message, { kind: "in" | "out" }> | undefined {
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.kind === "in" || m.kind === "out") return m;
  }
  if (c.preview) return { id: `${c.id}-preview`, kind: 'in', text: c.preview, at: c.time };
  return undefined;
}

export function lastOutboundIndex(c: Conversation): number {
  for (let i = c.messages.length - 1; i >= 0; i--) if (c.messages[i].kind === "out") return i;
  return -1;
}

export function matchesSearch(c: Conversation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [c.name, c.phone, c.phone.replace(/\s/g, ""), c.org, ...c.messages.map((m) => ("text" in m ? m.text : ""))];
  return haystack.some((v) => v && v.toLowerCase().includes(q));
}

/** The open conversation always stays in the Unread tab even after reading it,
 * so the row doesn't vanish from under the cursor. */
export function matchesFilter(c: Conversation, filter: InboxFilter, selectedId: string | null): boolean {
  switch (filter) {
    case "all": return true;
    case "unread": return c.unread > 0 || c.id === selectedId;
    case "open": return c.status === "open";
    case "closed": return c.status === "closed";
    case "unassigned": return !c.assigneeId;
  }
}

export function isFailed(m: Message): m is OutboundMessage {
  return m.kind === "out" && m.status === "failed";
}

/** Current time as HH:mm in IST, whatever the device's zone. */
export function nowIst(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
