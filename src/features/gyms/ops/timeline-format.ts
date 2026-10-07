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
  "organization.deletion_requested": "Gym deletion scheduled",
  "organization.deletion_restored": "Gym deletion cancelled",
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

export function eventTitle(event: Pick<TimelineEvent, "actionKey" | "operation" | "entityType">): string {
  const explicit = ACTION_LABEL[event.actionKey];
  if (explicit) return explicit;
  const noun = event.entityType ? ENTITY_NOUN[event.entityType]?.[0] : undefined;
  const op = (event.operation ?? event.actionKey.split(".").pop() ?? "").toUpperCase();
  if (noun && OPERATION_VERB[op]) {
    const verb = op === "INSERT" ? (INSERT_VERB[event.entityType ?? ""] ?? OPERATION_VERB[op]) : OPERATION_VERB[op];
    return `${noun} ${verb}`;
  }
  return humanizeKey(event.actionKey);
}

const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Platform admin",
  owner: "Gym owner",
  staff: "Staff",
  trainer: "Trainer",
  system: "System",
};
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? humanizeKey(role);

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
  suspended_at: "Suspended at",
  gender: "Gender",
  category: "Category",
  vendor: "Vendor",
  description: "Description",
};

const HIDDEN_FIELD = /(^id$|_id$|_by$|^idempotency_key$|^group_id$|^provider_metadata$|^created_at$|^updated_at$|^edited_at$|_hash$|^duplicate_override$)/;

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? humanizeKey(key);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$/;

export function formatFieldValue(key: string, value: unknown, currency: string | null, timeZone: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && key.endsWith("_minor")) return formatMinor(value, currency ?? "INR");
  if (typeof value === "string") {
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const dateOnly = value.length === 10;
        return new Intl.DateTimeFormat("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          ...(dateOnly ? { timeZone: "UTC" } : { hour: "numeric", minute: "2-digit", timeZone }),
        }).format(d);
      }
    }
    if (key === "status" || key === "method" || key === "role" || key === "access_status") return humanizeKey(value);
    return value;
  }
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return JSON.stringify(value);
}

export type FieldChange = { key: string; label: string; before: string; after: string };

/** Old → new pairs for an UPDATE, with internal columns and unchanged fields
 * removed. `internalOnly` is true when something changed but nothing an admin
 * would recognise (so the UI can say so instead of showing an empty diff). */
export function fieldChanges(event: TimelineEvent, timeZone: string): { changes: FieldChange[]; internalOnly: boolean } {
  const fields = event.changedFields ?? [];
  const visible = fields.filter((k) => !HIDDEN_FIELD.test(k));
  const currency = event.currency;
  const changes = visible.map((key) => ({
    key,
    label: fieldLabel(key),
    before: formatFieldValue(key, event.oldValues?.[key], currency, timeZone),
    after: formatFieldValue(key, event.newValues?.[key], currency, timeZone),
  }));
  return { changes, internalOnly: fields.length > 0 && visible.length === 0 };
}

/** The one-line "Mohammed Ali · ₹1,500 · Monthly Membership" under the title. */
export function eventSubject(event: TimelineEvent, timeZone: string): string {
  const parts: string[] = [];
  if (event.memberName) parts.push(event.memberName);
  if (event.amountMinor !== null) parts.push(formatMinor(event.amountMinor, event.currency ?? "INR"));
  const values = event.newValues ?? event.oldValues ?? {};
  const plan = (values.plan_name_snapshot ?? values.renewal_plan_name ?? (event.entityType === "membership_plans" ? values.name : null)) as string | null | undefined;
  if (plan) parts.push(String(plan));
  const detail = event.detail ?? {};
  if (!parts.length && typeof detail.error_message === "string") parts.push(detail.error_message);
  if (!parts.length && typeof detail.error === "string") parts.push(detail.error);
  if (!parts.length && typeof detail.title === "string") parts.push(detail.title);
  if (!parts.length && typeof detail.reason === "string" && detail.reason !== "No note") parts.push(`Reason: ${detail.reason}`);
  if (!parts.length && event.entityType === "branches" && typeof values.name === "string") parts.push(values.name);
  if (!parts.length && event.entityType === "members" && typeof values.first_name === "string") {
    parts.push(`${values.first_name}${values.last_name ? ` ${values.last_name}` : ""}`);
  }
  void timeZone;
  return parts.join(" · ");
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
  return sorted.slice(0, 2).map((c) => `${c.label}: ${c.before} → ${c.after}`);
}

export const STATUS_LABEL: Record<TimelineEvent["status"], string> = {
  success: "Success",
  warning: "Warning",
  failed: "Failed",
};

export function relativeTime(value: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
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
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(value));
}

const SOURCE_LABEL: Record<string, string> = {
  "Gym app": "Gym app (web or mobile — not distinguished in the audit record)",
  "Platform admin": "Platform admin",
  Worker: "Background worker",
  Webhook: "Webhook",
  Razorpay: "Razorpay",
  System: "System",
};
export const sourceLabel = (origin: string): string => SOURCE_LABEL[origin] ?? origin;
