import { formatMinor } from "@/core/money/format";
import type { TimelineEvent } from "./types";

/**
 * Turns raw timeline rows into the wording admins read. Pure (no server-only
 * import) so the server page and the client details drawer share one source
 * of truth. Table and column names appear only inside the drawer's
 * "Technical details" — never in the main feed.
 */

const ACTION_LABEL: Record<string, string> = {
  "subscription.extend": "Subscription extended",
  "subscription.change_package": "Package changed",
  "subscription.cancel": "Subscription cancelled",
  "subscription.restore": "Subscription restored",
  "subscription.schedule_package": "Package scheduled",
  "subscription.clear_scheduled_package": "Scheduled package cleared",
  "organization.suspend": "Gym suspended",
  "organization.reactivate": "Gym reactivated",
  "organization.deletion_requested": "Gym deletion requested",
  "organization.deletion_restored": "Gym deletion cancelled",
  "organization.deletion_completed": "Gym deletion completed",
  "organization.deleted": "Gym deletion completed",
  "organization.update_profile": "Gym profile updated",
  "organization.update_logo": "Gym logo updated",
  "gym.created": "Gym created",
  "invitation.sent": "Owner invitation sent",
  "invitation.resent": "Owner invitation resent",
  "invitation.revoked": "Owner invitation revoked",
  "invitation.phone_verified": "Owner phone verified and account activated",
  "payment.manual_record": "Manual payment recorded",
  "admin_note.added": "Admin note added",
  "admin_note.edited": "Admin note edited",
  "admin_note.deleted": "Admin note deleted",
  "operation_lock.enable": "Restriction enabled",
  "operation_lock.disable": "Restriction lifted",
  "feature_flag.set": "Feature flag changed",
  "sessions.revoke": "Users signed out",
  "whatsapp_credits.add": "WhatsApp credits added",
  "whatsapp_credits.remove": "WhatsApp credits removed",
  "whatsapp_credits.grant": "WhatsApp credits granted",
  "whatsapp.retry_failed": "Failed WhatsApp messages retried",
  "whatsapp.message_failed": "WhatsApp message failed",
  "alert.raised": "Alert raised",
  "alert.acknowledge": "Alert acknowledged",
  "alert.resolve": "Alert resolved",
  "data_export.requested": "Data export requested",
  "webhook.failed": "Payment webhook failed",
  "billing.payment": "Subscription payment",
  "job.broadcast_failed": "Scheduled broadcast failed",
};

const ENTITY_NOUN: Record<string, [string, string?]> = {
  payments: ["Payment"],
  members: ["Member"],
  member_subscriptions: ["Membership"],
  membership_plans: ["Membership plan"],
  plan_groups: ["Plan group"],
  staff_memberships: ["Team member"],
  branches: ["Branch"],
  gyms: ["Gym"],
  organizations: ["Gym profile"],
  inventory_products: ["Inventory product"],
  inventory_purchases: ["Inventory purchase"],
  inventory_sales: ["Inventory sale"],
  expenses: ["Expense"],
  recurring_expenses: ["Recurring expense"],
  leads: ["Lead"],
  lead_activities: ["Lead activity"],
};

const OPERATION_VERB: Record<string, string> = {
  INSERT: "created",
  UPDATE: "updated",
  DELETE: "removed",
};

const INSERT_VERB: Record<string, string> = {
  payments: "recorded",
  members: "added",
  member_subscriptions: "assigned",
  staff_memberships: "added",
  branches: "added",
  expenses: "recorded",
  inventory_purchases: "recorded",
  inventory_sales: "recorded",
  leads: "added",
};

export function humanizeKey(key: string): string {
  const spaced = key.replace(/[._]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function eventTitle(event: TimelineEvent): string {
  const keys = changedKeys(event);
  const gym = ["organizations", "organization", "gyms"].includes(event.entityType ?? "");
  if (gym && event.operation === "DELETE") return "Gym deletion completed";
  if (gym && becameSet(event, "deletion_requested_at")) return "Gym deletion requested";
  if (gym && keys.includes("deletion_requested_at") && !isSet(event.newValues?.deletion_requested_at)) return "Gym deletion cancelled";
  if (event.entityType === "payments" && event.operation === "UPDATE") {
    if (becameSet(event, "voided_at") || (keys.includes("status") && event.newValues?.status === "voided")) return "Payment voided";
    if (keys.filter(k => !BOOKKEEPING_FIELD.test(k)).length === 1 && becameSet(event, "invoice_number")) return "Invoice number assigned";
    if (keys.includes("status")) {
      const status = event.newValues?.status;
      if (status === "succeeded" || status === "paid") return "Payment received";
      if (status === "refunded") return "Payment refunded";
      if (status === "failed") return "Payment failed";
      if (status === "cancelled") return "Payment cancelled";
    }
  }
  if (event.entityType === "staff_memberships" && event.operation === "UPDATE" && keys.some(k => ["role", "access_status", "permissions"].includes(k))) return "Team permissions changed";
  const photo = photoChange(event);
  if (photo && keys.every(k => PHOTO_FIELD.test(k) || BOOKKEEPING_FIELD.test(k))) return photo.title;
  const explicit = ACTION_LABEL[event.actionKey];
  if (explicit) return explicit;
  const noun = event.entityType ? ENTITY_NOUN[event.entityType]?.[0] : undefined;
  const op = (event.operation ?? event.actionKey.split(".").pop() ?? "").toUpperCase();
  if (noun && OPERATION_VERB[op]) {
    const verb = op === "INSERT" ? (INSERT_VERB[event.entityType ?? ""] ?? OPERATION_VERB[op]) : OPERATION_VERB[op];
    return `${noun} ${verb}`;
  }
  return "Activity recorded";
}

const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Platform admin",
  owner: "Gym owner",
  staff: "Staff",
  trainer: "Trainer",
  system: "System",
  unknown: "Role not recorded",
  platform_owner: "Platform owner",
  super_admin: "Super admin",
  support_admin: "Support admin",
  sales_manager: "Sales manager",
  sales_agent: "Sales agent",
};
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? (role ? humanizeKey(role) : "Role not recorded");

export const CATEGORY_LABEL: Record<string, string> = {
  members: "Members",
  payments: "Payments",
  memberships: "Memberships",
  subscription: "Subscription",
  whatsapp: "WhatsApp",
  billing: "Billing",
  jobs: "Jobs",
  webhooks: "Webhooks",
  security: "Security",
  admin: "Admin actions",
  system: "System alerts",
  gym: "Gym settings",
  expenses: "Expenses",
  inventory: "Inventory",
  leads: "Leads",
  other: "Other",
};

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  amount_minor: "Amount",
  base_amount_minor: "Base amount",
  gst_amount_minor: "GST",
  gst_percent: "GST %",
  agreed_price_minor: "Price charged",
  list_price_minor: "List price",
  purchase_price_minor: "Purchase price",
  selling_price_minor: "Selling price",
  total_amount_minor: "Total",
  plan_name_snapshot: "Plan",
  renewal_plan_name: "Renewal plan",
  name: "Name",
  first_name: "First name",
  last_name: "Last name",
  phone_e164: "Phone",
  email: "Email",
  method: "Payment method",
  invoice_number: "Invoice number",
  reference: "Reference",
  note: "Note",
  start_date: "Start date",
  end_date: "Expiry",
  renewal_start_date: "Renewal start",
  duration_days: "Duration (days)",
  paid_at: "Paid at",
  refunded_at: "Refunded at",
  voided_at: "Voided at",
  void_reason: "Void reason",
  edit_reason: "Edit reason",
  role: "Role",
  access_status: "Access",
  city: "City",
  contact_phone: "Contact phone",
  contact_email: "Contact email",
  grace_period_days: "Grace period (days)",
  current_stock: "Stock",
  deleted_at: "Deleted at",
  deletion_requested_at: "Deletion requested at",
  purge_after: "Deletion deadline",
  permissions: "Permissions",
  suspended_at: "Suspended at",
  gender: "Gender",
  category: "Category",
  vendor: "Vendor",
  description: "Description",
};

const BOOKKEEPING_FIELD = /^(created_at|updated_at|edited_at)$/;
const PHOTO_FIELD = /^(avatar(?:_path|_url|_key)?|profile_photo(?:_path|_url)?|photo_url)$/i;
const SECRET_FIELD = /password|passwd|token|secret|credential|authorization|cookie|private.?key|api.?key|otp|signature|signed.?url|provider_metadata|headers/i;
const HIDDEN_FIELD = /(^id$|_id$|_by$|^idempotency_key$|^group_id$|^created_at$|^updated_at$|^edited_at$|_hash$|^duplicate_override$)/;
const isSet = (value: unknown) => value !== null && value !== undefined && value !== "";

/** Defence in depth: also used BEFORE serializing server results to the browser.
 * Unknown technical fields remain available, but secret-shaped keys are redacted
 * recursively and URLs are never copied into summaries, JSON details or CSV. */
export function safeText(value: string): string {
  return value
    .replace(/(?:https?:\/\/|data:)[^\s<>"']+/gi, "[URL hidden]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[Redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [Redacted]")
    .replace(/\b(password|token|secret|api[_-]?key|authorization|otp)\s*[:=]\s*[^\s,;]+/gi, "$1=[Redacted]");
}

export function sanitizeAuditValue(value: unknown, key = ""): unknown {
  if (SECRET_FIELD.test(key)) return "[Redacted]";
  if (PHOTO_FIELD.test(key)) return isSet(value) ? "Photo set" : null;
  if (Array.isArray(value)) return value.map(v => sanitizeAuditValue(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeAuditValue(v, k)]));
  return typeof value === "string" ? safeText(value) : value;
}

export function changedKeys(event: TimelineEvent): string[] {
  if (event.changedFields) return [...new Set(event.changedFields)];
  if (!event.oldValues || !event.newValues) return [];
  return [...new Set([...Object.keys(event.oldValues), ...Object.keys(event.newValues)])]
    .filter(k => JSON.stringify(event.oldValues?.[k]) !== JSON.stringify(event.newValues?.[k]));
}

function becameSet(event: TimelineEvent, key: string): boolean {
  return event.operation !== "INSERT" && changedKeys(event).includes(key) && !isSet(event.oldValues?.[key]) && isSet(event.newValues?.[key]);
}

export function photoChange(event: TimelineEvent): { title: string; before: string; after: string } | null {
  const keys = changedKeys(event).filter(k => PHOTO_FIELD.test(k));
  if (!keys.length) return null;
  const hasPhoto = (values: Record<string, unknown> | null) => Object.entries(values ?? {}).some(([k, v]) => PHOTO_FIELD.test(k) && isSet(v));
  const before = hasPhoto(event.oldValues);
  const after = hasPhoto(event.newValues);
  return {
    title: !before && after ? "Profile photo added" : before && !after ? "Profile photo removed" : "Profile photo changed",
    before: before ? "Photo set" : "Not set",
    after: after ? before ? "Photo replaced" : "Photo set" : "Not set",
  };
}

export function eventEmphasis(event: TimelineEvent): string | null {
  const title = eventTitle(event);
  if (title === "Gym deletion requested") return "Deletion request";
  if (title === "Gym deletion completed") return "Completed deletion";
  if (title === "Payment voided") return "Voided payment";
  if (title === "Team permissions changed" || /^(operation_lock\.|sessions\.|admin\.(role|revoke|grant|permissions))/.test(event.actionKey)) return "Access change";
  return null;
}

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? humanizeKey(key);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

export function formatFieldValue(key: string, value: unknown, currency: string | null, timeZone: string): string {
  if (!isSet(value)) return "Not set";
  if (SECRET_FIELD.test(key)) return "[Redacted]";
  if (PHOTO_FIELD.test(key)) return "Photo set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key.endsWith("_minor") && (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value)))) return formatMinor(Number(value), currency || "INR");
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const dateOnly = value.length === 10;
        if (!dateOnly) return exactTime(value, timeZone);
        return new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          ...(dateOnly ? { timeZone: "UTC" } : { hour: "numeric", minute: "2-digit", timeZone }),
        }).format(d);
      }
    }
    if (key === "status" || key === "method" || key === "role" || key === "access_status") return humanizeKey(value);
    return safeText(value);
  }
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return JSON.stringify(sanitizeAuditValue(value));
}

export type FieldChange = { key: string; label: string; before: string; after: string };

/** Old → new pairs for an UPDATE, with internal columns and unchanged fields
 * removed. `internalOnly` is true when something changed but nothing an admin
 * would recognise (so the UI can say so instead of showing an empty diff). */
export function fieldChanges(event: TimelineEvent, timeZone: string): { changes: FieldChange[]; internalOnly: boolean } {
  const fields = changedKeys(event);
  const visible = fields.filter((k) => !HIDDEN_FIELD.test(k) && !SECRET_FIELD.test(k) && !PHOTO_FIELD.test(k) && k in FIELD_LABEL);
  const currency = event.currency;
  const changes = visible.map((key) => ({
    key,
    label: fieldLabel(key),
    before: formatFieldValue(key, event.oldValues?.[key], currency, timeZone),
    after: formatFieldValue(key, event.newValues?.[key], currency, timeZone),
  }));
  const photo = photoChange(event);
  if (photo) changes.push({ key: "profile_photo", label: "Profile photo", before: photo.before, after: photo.after });
  return { changes, internalOnly: fields.length > 0 && changes.length === 0 };
}

/** The one-line "Mohammed Ali · ₹1,500 · Monthly Membership" under the title. */
export function eventSubject(event: TimelineEvent, timeZone: string): string {
  const parts: string[] = [];
  const values = { ...event.oldValues, ...event.newValues };
  const snapshotName = ["members", "staff_memberships"].includes(event.entityType ?? "")
    ? [values.first_name, values.last_name].filter(v => typeof v === "string" && v).join(" ")
    : typeof values.name === "string" ? values.name : "";
  const name = event.memberName || event.recordName || snapshotName;
  if (name) parts.push(safeText(name));
  if (event.amountMinor !== null) parts.push(formatMinor(event.amountMinor, event.currency ?? "INR"));
  const plan = (values.plan_name_snapshot ?? values.renewal_plan_name ?? (event.entityType === "membership_plans" ? values.name : null)) as string | null | undefined;
  if (plan && !parts.includes(String(plan))) parts.push(safeText(String(plan)));
  const detail = event.detail ?? {};
  if (!parts.length && typeof detail.error_message === "string") parts.push(detail.error_message);
  if (!parts.length && typeof detail.error === "string") parts.push(detail.error);
  if (!parts.length && typeof detail.title === "string") parts.push(detail.title);
  if (!parts.length && typeof detail.reason === "string" && detail.reason !== "No note") parts.push(`Reason: ${detail.reason}`);
  void timeZone;
  return safeText(parts.join(" · "));
}

/** "Status: Pending → Paid" style highlights, at most two, for the feed card. */
export function changeHighlights(event: TimelineEvent, timeZone: string): string[] {
  const { changes } = fieldChanges(event, timeZone);
  const priority = ["status", "amount_minor", "plan_name_snapshot", "end_date", "method"];
  const sorted = [...changes].sort((a, b) => {
    const ia = priority.indexOf(a.key);
    const ib = priority.indexOf(b.key);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return sorted.slice(0, 2).map((c) => c.key === "profile_photo" ? photoChange(event)!.title : `${c.label}: ${c.before} → ${c.after}`);
}

export const STATUS_LABEL: Record<TimelineEvent["status"], string> = {
  success: "Success",
  warning: "Warning",
  failed: "Failed",
};

export function relativeTime(value: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "Time not recorded";
  if (seconds < -45) return "In the future";
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function exactTime(value: string, timeZone: string): string {
  if (!Number.isFinite(new Date(value).getTime())) return "Time not recorded";
  const formatted = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(value));
  return `${formatted} ${timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta" ? "IST (UTC+05:30)" : timeZone}`;
}

const SOURCE_LABEL: Record<string, string> = {
  "Gym app": "Gym app",
  "Platform admin": "Admin panel",
  "Admin panel": "Admin panel",
  Worker: "Background worker",
  Webhook: "Webhook",
  Razorpay: "Razorpay",
  System: "System",
};
export const sourceLabel = (origin: string): string => SOURCE_LABEL[origin] ?? (origin ? safeText(origin) : "Source not recorded");

/** Only destinations checked against live, organization-scoped records by the
 * read RPC. No guessed routes to tenant-only payments/plans or deleted records. */
export function eventRecordLink(event: TimelineEvent, organizationId: string): { href: string; label: string } | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(organizationId)) return null;
  if (event.memberId && uuid.test(event.memberId) && event.memberExists && event.memberName) {
    const params = new URLSearchParams({ q: event.memberName });
    if (event.memberDeleted) params.set("roster", "deleted");
    return { href: `/admin/gyms/${organizationId}/members?${params}`, label: "Find member" };
  }
  if (event.recordExists && ["organization", "organizations", "gyms"].includes(event.entityType ?? "")) return { href: `/admin/gyms/${organizationId}`, label: "View gym" };
  return null;
}
