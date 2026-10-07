/** Shared CRM vocabulary and display types. Authorization is enforced in SQL. */

export type SalesRole = "admin" | "manager" | "rep";
export type Scope = "my" | "team" | "all";
export type SalesUserId = string;

export type SalesUser = {
  id: SalesUserId;
  name: string;
  initials: string;
  /** Human label shown under the name, e.g. "Sales rep · South". */
  title: string;
  /** Sales territory team. `null` = platform owner (belongs to no team). */
  team: string | null;
  assignable?: boolean;
};

export const ROLE_CONFIG: Record<SalesRole, { label: string; scopes: Scope[]; defaultScope: Scope }> = {
  admin: { label: "Platform admin", scopes: ["my", "team", "all"], defaultScope: "all" },
  manager: { label: "Sales manager", scopes: ["my", "team"], defaultScope: "team" },
  rep: { label: "Sales rep", scopes: ["my"], defaultScope: "my" },
};

export const SCOPE_LABEL: Record<Scope, string> = { my: "My leads", team: "Team leads", all: "All leads" };

// ── Stages ───────────────────────────────────────────────────────────────────

export type OpenStage =
  | "new"
  | "contacted"
  | "interested"
  | "demo_req"
  | "demo_sched"
  | "trial"
  | "followup"
  | "converted";
export type ClosedStage = "later" | "notint" | "lost";
export type LeadStage = OpenStage | ClosedStage;
/** The board has one column per open stage plus a single catch-all "closed" column. */
export type BoardColumn = OpenStage | "closed";

export const BOARD_COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: "new", label: "New lead" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "demo_req", label: "Demo requested" },
  { key: "demo_sched", label: "Demo scheduled" },
  { key: "trial", label: "Trial started" },
  { key: "followup", label: "Follow-up" },
  { key: "converted", label: "Converted" },
  { key: "closed", label: "Later / Lost" },
];

export const CLOSED_LABEL: Record<ClosedStage, string> = {
  later: "Follow up later",
  notint: "Not interested",
  lost: "Lost",
};

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New lead",
  contacted: "Contacted",
  interested: "Interested",
  demo_req: "Demo requested",
  demo_sched: "Demo scheduled",
  trial: "Trial started",
  followup: "Follow-up",
  converted: "Converted",
  ...CLOSED_LABEL,
};

/** "How far along" ordering, used only to seed demo activity timelines. */
export const STAGE_RANK: Record<LeadStage, number> = {
  new: 0,
  contacted: 1,
  interested: 2,
  demo_req: 3,
  demo_sched: 4,
  trial: 5,
  followup: 6,
  converted: 7,
  later: 2,
  notint: 2,
  lost: 2,
};

/** Options for the "Move to stage" control: every open stage + the three closed outcomes. */
export const STAGE_OPTIONS: { value: LeadStage; label: string }[] = [
  ...BOARD_COLUMNS.filter((c) => c.key !== "closed").map((c) => ({ value: c.key as LeadStage, label: c.label })),
  ...(Object.entries(CLOSED_LABEL) as [ClosedStage, string][]).map(([value, label]) => ({ value, label })),
];

export const isClosedStage = (stage: LeadStage): stage is ClosedStage => stage in CLOSED_LABEL;
export const columnOf = (stage: LeadStage): BoardColumn => (isClosedStage(stage) ? "closed" : stage);

export const LOST_REASONS = ["Pricing", "Using competitor", "Not ready", "No response", "Missing feature", "Business closed", "Other"];
export const LEAD_SOURCES = ["Website Demo", "WhatsApp", "Instagram", "Referral", "Google", "Cold call", "Field visit", "Existing customer"];
export const PLAN_OPTIONS = ["Monthly", "Quarterly", "Half-yearly", "Yearly"];

// ── Lead ─────────────────────────────────────────────────────────────────────

export type DueState = "overdue" | "today" | "upcoming";
export type FollowUpType = "Call" | "WhatsApp" | "Email" | "Meeting" | "Demo";
export type DemoStatus = "Awaiting confirmation" | "Scheduled" | "Rescheduled" | "Completed" | "No show" | "Cancelled";

export type Lead = {
  id: string;
  organizationId?: string | null;
  gym: string;
  city: string;
  state: string;
  area: string;
  pin: string;
  contact: string;
  /** Normalized Indian mobile in E.164 format. */
  phone: string;
  email: string;
  source: string;
  stage: LeadStage;
  owner: SalesUserId;
  /** IST display date derived from the database timestamp. */
  createdOn: string;
  /** Whole days since `createdOn` — drives the "Created: last N days" filter. */
  ageDays: number;
  /** "Not yet" | "Yesterday" | "6 days ago" … */
  lastContacted: string;
  lastContactedDays: number;
  branches: string;
  members: string;
  software: string;
  priority: "normal" | "high";
  next: { label: string; due: DueState; type: FollowUpType } | null;
  demo: { status: DemoStatus; when: string; scheduledAt: string; suggested?: boolean } | null;
  trial: { start: string; end: string; endsInDays: number } | null;
  conversion: { date: string; plan: string; org: string; account: string; subscription: string; by: string } | null;
  lostReason: string | null;
  note: string | null;
  /** Another lead's id when the phone number matches an existing lead. */
  duplicateOf: string | null;
  possibleDuplicate?: boolean;
  expectedPlan: string;
};

export type ActivityKind =
  | "created" | "assign" | "call" | "whatsapp" | "email" | "meeting" | "note" | "demo"
  | "clock" | "trial" | "check" | "x" | "swap" | "warn" | "merge";

export type Activity = { id: string; kind: ActivityKind; title: string; by: string; date: string; time: string; note: string };

export type FollowUp = {
  id: string;
  type: FollowUpType;
  /** "5 Oct · 11:00 AM" */
  when: string;
  status: DueState | "done" | "stopped";
  note: string;
};

export type AssignmentEntry = { text: string; meta: string };

export type LeadFilters = {
  owner: string;
  stage: string;
  source: string;
  state: string;
  city: string;
  area: string;
  pin: string;
  priority: "" | "high";
  followUp: "" | DueState | "none";
  demo: string;
  trial: "" | "active" | "ending";
  range: "" | "7" | "30" | "90";
};

export const EMPTY_FILTERS: LeadFilters = {
  owner: "", stage: "", source: "", state: "", city: "", area: "", pin: "", priority: "", followUp: "", demo: "", trial: "", range: "",
};

export type AttentionReason = "overdue" | "demo" | "trial" | "stale";

// ── Coverage / analytics shapes ──────────────────────────────────────────────

/** [identified, contacted, trials, customers] */
export type CoverageCounts = [number, number, number, number];
export type CoverageNode = { name: string; n: CoverageCounts; kids?: CoverageNode[] };
export const COVERAGE_LEVELS = ["State", "City", "Area", "PIN code"] as const;
/** Which `LeadFilters` key each coverage depth maps to when "View leads" is clicked. */
export const COVERAGE_FILTER_KEYS = ["state", "city", "area", "pin"] as const;


export function formatPhone(phone: string): string {
 const digits=phone.replace(/\D/g, "").slice(-10);return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`;
}
