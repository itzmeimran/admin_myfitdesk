/** Shapes and static catalogs for the Gym Command Center. No `server-only`
 * import here: Client Components import the catalogs and types, while the
 * queries that fill them live in ./queries.ts. */

export type LockType =
  | "read_only"
  | "block_payments"
  | "block_member_edits"
  | "block_member_imports"
  | "block_whatsapp"
  | "block_scheduled_broadcasts"
  | "block_staff_login"
  | "block_financial_edits";

export const LOCK_CATALOG: { type: LockType; label: string; impact: string; severe?: boolean }[] = [
  {
    type: "read_only",
    label: "Full read-only mode",
    impact: "Implies every other restriction: the gym can view its data but nothing may be created, edited or sent.",
    severe: true,
  },
  { type: "block_payments", label: "Block new payments", impact: "The gym cannot record or collect new member payments." },
  { type: "block_member_edits", label: "Block member edits", impact: "Members cannot be added, changed or removed." },
  { type: "block_member_imports", label: "Block member imports", impact: "Bulk member imports are refused." },
  { type: "block_whatsapp", label: "Pause WhatsApp sending", impact: "No WhatsApp messages are sent for this gym. Queued messages wait until sending is resumed." },
  { type: "block_scheduled_broadcasts", label: "Block scheduled broadcasts", impact: "Scheduled campaigns do not run." },
  { type: "block_staff_login", label: "Block staff & trainer login", impact: "Only the owner can sign in; staff and trainers are refused.", severe: true },
  { type: "block_financial_edits", label: "Lock financial edits", impact: "Existing payments, expenses and invoices cannot be edited or voided." },
];

export function lockLabel(type: string): string {
  return LOCK_CATALOG.find((l) => l.type === type)?.label ?? type;
}

export type ActiveLock = { lockType: LockType; reason: string; expiresAt: string | null };

export type WebhookProvider = {
  provider: "razorpay" | "whatsapp" | "email";
  label: string;
  status: "healthy" | "warning" | "failed" | "no_events" | "not_configured" | "not_tracked";
  lastReceivedAt: string | null;
  lastProcessedAt: string | null;
  failedCount: number;
  unprocessedCount: number;
  lastError: string | null;
};

export type OpsSummary = {
  environment: string;
  suspendedAt: string | null;
  locks: ActiveLock[];
  owner: { emailVerified: boolean; phoneVerified: boolean; lastSignInAt: string | null; lastActiveAt: string | null } | null;
  whatsapp: {
    balance: number;
    sent30d: number;
    delivered30d: number;
    read30d: number;
    failed30d: number;
    failureRate: number | null;
    lastMessageAt: string | null;
    lastSuccessAt: string | null;
    paused: boolean;
  };
  payments: { failed30d: number; reconciliationIssues: number; reconciliationCritical: number };
  jobs: { failed: number; degraded: number; tracked: number };
  webhooks: WebhookProvider[];
  backup: { lastSuccessAt: string | null; scope: string };
  alerts: { open: number; unacknowledged: number; critical: number };
  dataHealth: { issues: number; critical: number };
};

export type WhatsAppOps = {
  balance: number;
  paused: boolean;
  totalSent: number;
  sent30d: number;
  delivered30d: number;
  read30d: number;
  failed30d: number;
  skipped30d: number;
  pending: number;
  lastMessageAt: string | null;
  lastSuccessAt: string | null;
  lastFailure: { at: string; code: string | null; message: string | null } | null;
  topFailures: { code: string; message: string; count: number }[];
  retryEligible: number;
};

export type CreditHistoryRow = {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
  createdByEmail: string | null;
  adminReason: string | null;
};

export type JobStatus = "healthy" | "degraded" | "failed" | "idle" | "disabled" | "not_configured" | "not_tracked";
export type JobRow = {
  key: string;
  label: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextExpectedAt: string | null;
  status: JobStatus;
  failures7d: number;
  errorMessage: string | null;
  detail: Record<string, unknown>;
};

export type WebhookEvent = {
  id: string;
  provider: string;
  eventType: string;
  receivedAt: string;
  processedAt: string | null;
  processingError: string | null;
  attempts: number;
  signatureVerified: boolean | null;
  orderId: string | null;
  paymentId: string | null;
  amountMinor: number | null;
  gatewayStatus: string | null;
};

export type WebhookOverview = { providers: WebhookProvider[]; recentEvents: WebhookEvent[] };

export type CheckFinding = {
  key: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  count: number;
  /** Data-health checks cap `samples` at 10 and report the real total here. */
  total?: number;
  samples: { id: string; label: string; at?: string | null }[];
};

export type OpsAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  type: string;
  title: string;
  message: string;
  createdAt: string;
  status: "open" | "acknowledged" | "resolved";
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
};

export type AccessInfo = {
  owner: {
    userId: string;
    name: string;
    email: string | null;
    phone: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastSignInAt: string | null;
    loginMethod: string | null;
    accessStatus: string;
    banned: boolean;
    lastActiveAt: string | null;
  } | null;
  ownerSessions: { id: string; startedAt: string; lastSeenAt: string | null; device: string | null }[];
  ownerSessionCount: number;
  orgSessions: number;
  orgSessionUsers: number;
  staffTotal: number;
  staffDisabled: number;
};

export type LockRow = {
  lockType: LockType;
  isEnabled: boolean;
  isActive: boolean;
  reason: string;
  expiresAt: string | null;
  updatedAt: string;
  updatedByEmail: string | null;
};

export type FlagRow = {
  flagKey: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  isEnabled: boolean;
  overridden: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
  reason: string | null;
};

export type NoteRow = {
  id: string;
  content: string;
  category: string | null;
  createdAt: string;
  updatedAt: string | null;
  createdByEmail: string | null;
  createdByMe: boolean;
};

export type TimelineEvent = {
  eventId: string;
  source: string;
  occurredAt: string;
  actionKey: string;
  operation: string | null;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actorLabel: string;
  actorRole: string;
  actorType: string;
  category: string;
  status: "success" | "warning" | "failed";
  memberId: string | null;
  memberName: string | null;
  amountMinor: number | null;
  currency: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedFields: string[] | null;
  detail: Record<string, unknown> | null;
  requestId: string | null;
  ipAddress: string | null;
  origin: string;
  recordName: string | null;
  recordExists: boolean;
  memberExists: boolean;
  memberDeleted: boolean;
  groupCount?: number;
  groupPlan?: string | null;
  groupAmountMinor?: number | null;
  groupHasImportant?: boolean;
};

export const EXPORT_DATASETS = [
  { key: "members", label: "Members" },
  { key: "memberships", label: "Memberships" },
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "inventory", label: "Inventory" },
  { key: "whatsapp", label: "WhatsApp history" },
] as const;
