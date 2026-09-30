import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { formatCalendarDate, formatZonedDateTime } from "@/core/dates/format";
import { formatMinorWhole } from "@/core/money/format";

export type MembershipState =
  | "none"
  | "active"
  | "expiring_soon"
  | "expired"
  | "upcoming"
  | "frozen"
  | "cancelled"
  | "deleted";

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  branchId: string;
  branchName: string;
  memberStatus: string;
  joinedOn: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  planName: string | null;
  subscriptionId: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  membershipState: MembershipState;
  lastPayment: {
    amountMinor: number;
    currency: string;
    method: string;
    status: string;
    at: string;
  } | null;
  paymentPending: boolean;
  invalidPhone: boolean;
};

export type MemberListParams = {
  search?: string;
  memberStatus?: string;
  branchId?: string;
  state?: string;
  deleted?: boolean;
  sortCol?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export type MemberSummary = {
  timezone: string;
  totalMembers: number;
  activeMemberships: number;
  expiringSoon: number;
  expiredMemberships: number;
  upcomingMemberships: number;
  newMembersMonth: number;
  noActivePlan: number;
  invalidPhone: number;
  pendingPaymentCount: number;
  pendingPaymentAmountMinor: number;
  currency: string;
  failedWhatsAppToday: number;
  deletedMembers: number;
};

type AdminGymMemberRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  branch_id: string;
  branch_name: string;
  member_status: string;
  joined_on: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  plan_name: string | null;
  subscription_id: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  membership_state: MembershipState;
  last_payment_amount_minor: number | null;
  last_payment_currency: string | null;
  last_payment_method: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  payment_pending: boolean;
  invalid_phone: boolean;
  total_count: number;
};

type SummaryJson = {
  timezone: string;
  total_members: number;
  active_memberships: number;
  expiring_soon: number;
  expired_memberships: number;
  upcoming_memberships: number;
  new_members_month: number;
  no_active_plan: number;
  invalid_phone: number;
  pending_payment_count: number;
  pending_payment_amount_minor: number;
  currency: string;
  failed_whatsapp_today: number;
  deleted_members: number;
};

export async function getGymMembers(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: MemberListParams,
): Promise<{ rows: MemberRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_members_support", {
    p_organization_id: organizationId,
    p_search: params.search || undefined,
    p_member_status: params.memberStatus || undefined,
    p_branch_id: params.branchId || undefined,
    p_state: params.state || undefined,
    p_deleted: params.deleted ?? false,
    p_sort_col: params.sortCol,
    p_sort_dir: params.sortDir,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load members: ${error.message}`);

  const rows = (data ?? []) as AdminGymMemberRow[];
  return {
    total: rows[0]?.total_count ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" "),
      email: row.email,
      phone: row.phone_e164,
      branchId: row.branch_id,
      branchName: row.branch_name,
      memberStatus: row.member_status,
      joinedOn: row.joined_on,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      planName: row.plan_name,
      subscriptionId: row.subscription_id,
      subscriptionStartDate: row.subscription_start_date,
      subscriptionEndDate: row.subscription_end_date,
      membershipState: row.membership_state,
      lastPayment:
        row.last_payment_amount_minor !== null && row.last_payment_at
          ? {
              amountMinor: row.last_payment_amount_minor,
              currency: row.last_payment_currency ?? "INR",
              method: row.last_payment_method ?? "other",
              status: row.last_payment_status ?? "unknown",
              at: row.last_payment_at,
            }
          : null,
      paymentPending: row.payment_pending,
      invalidPhone: row.invalid_phone,
    })),
  };
}

export async function getGymMemberSummary(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  branchId?: string,
): Promise<MemberSummary> {
  const { data, error } = await supabase.rpc("admin_gym_members_summary", {
    p_organization_id: organizationId,
    p_branch_id: branchId || undefined,
  });
  if (error) throw new Error(`Failed to load member summary: ${error.message}`);
  const row = data as SummaryJson;
  return {
    timezone: row.timezone,
    totalMembers: row.total_members,
    activeMemberships: row.active_memberships,
    expiringSoon: row.expiring_soon,
    expiredMemberships: row.expired_memberships,
    upcomingMemberships: row.upcoming_memberships,
    newMembersMonth: row.new_members_month,
    noActivePlan: row.no_active_plan,
    invalidPhone: row.invalid_phone,
    pendingPaymentCount: row.pending_payment_count,
    pendingPaymentAmountMinor: row.pending_payment_amount_minor,
    currency: row.currency,
    failedWhatsAppToday: row.failed_whatsapp_today,
    deletedMembers: row.deleted_members,
  };
}

/** member id → stored avatar key, for the given members of one gym. One RPC
 * call for a whole page of rows (or a single member); failures degrade to "no
 * photo" rather than breaking the roster. */
export async function getMemberAvatarKeys(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  memberIds: string[],
): Promise<Map<string, string>> {
  const keys = new Map<string, string>();
  if (memberIds.length === 0) return keys;
  const { data, error } = await supabase.rpc("admin_gym_member_avatars", {
    p_organization_id: organizationId,
    p_member_ids: memberIds,
  });
  if (error) {
    console.error("Platform admin member avatar read failed", error);
    return keys;
  }
  for (const row of (data ?? []) as Array<{ member_id: string; avatar_key: string }>) {
    keys.set(row.member_id, row.avatar_key);
  }
  return keys;
}

/** Kept for the Overview snapshot call site, now backed by one aggregate RPC
 * rather than three paginated list reads. */
export async function getMemberExpirySnapshot(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ activeMembershipCount: number; expiringSoonCount: number; expiredCount: number }> {
  const summary = await getGymMemberSummary(supabase, organizationId);
  return {
    activeMembershipCount: summary.activeMemberships,
    expiringSoonCount: summary.expiringSoon,
    expiredCount: summary.expiredMemberships,
  };
}

export type MemberMembership = {
  id: string;
  branchId: string;
  planId: string | null;
  planName: string;
  startDate: string;
  endDate: string;
  state: MembershipState;
  status: string;
  agreedPriceMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type MemberPayment = {
  id: string;
  subscriptionId: string | null;
  amountMinor: number;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  paidAt: string;
  createdAt: string;
  invoiceNumber: string | null;
  planName: string | null;
  recordedByName: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  refundedByName: string | null;
  refundedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  receiptStatus: string | null;
  receiptCreatedAt: string | null;
  receiptSentAt: string | null;
  receiptDeliveredAt: string | null;
  receiptFailedAt: string | null;
};

export type MemberWhatsAppMessage = {
  id: string;
  paymentId: string | null;
  subscriptionId: string | null;
  template: string;
  messageType: string;
  origin: string;
  category: string;
  status: string;
  senderMode: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
};

export type MemberTimelineEvent = {
  id: string;
  label: string;
  detail?: string;
  at?: string;
  date?: string;
};

export type MemberDetail = {
  timezone: string;
  member: {
    id: string;
    organizationId: string;
    gymId: string;
    branchId: string;
    branchName: string;
    branchTimezone: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string;
    joinedOn: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  };
  memberships: MemberMembership[];
  payments: MemberPayment[];
  whatsapp: {
    sent: number;
    delivered: number;
    failed: number;
    lastMessageAt: string | null;
    lastTemplate: string | null;
    lastStatus: string | null;
    messages: MemberWhatsAppMessage[];
  };
  timeline: MemberTimelineEvent[];
};

type DetailJson = {
  timezone: string;
  member: {
    id: string;
    organization_id: string;
    gym_id: string;
    branch_id: string;
    branch_name: string;
    branch_timezone: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    joined_on: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  };
  memberships: Array<{
    id: string;
    branch_id: string;
    plan_id: string | null;
    plan_name: string;
    start_date: string;
    end_date: string;
    state: MembershipState;
    status: string;
    agreed_price_minor: number;
    currency: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  }>;
  payments: Array<{
    id: string;
    subscription_id: string | null;
    amount_minor: number;
    currency: string;
    method: string;
    status: string;
    reference: string | null;
    paid_at: string;
    created_at: string;
    invoice_number: string | null;
    plan_name: string | null;
    recorded_by_name: string | null;
    confirmed_by_name: string | null;
    confirmed_at: string | null;
    refunded_by_name: string | null;
    refunded_at: string | null;
    rejected_by_name: string | null;
    rejected_at: string | null;
    receipt_status: string | null;
    receipt_created_at: string | null;
    receipt_sent_at: string | null;
    receipt_delivered_at: string | null;
    receipt_failed_at: string | null;
  }>;
  whatsapp: {
    summary: {
      sent: number;
      delivered: number;
      failed: number;
      last_message_at: string | null;
      last_template: string | null;
      last_status: string | null;
    };
    messages: Array<{
      id: string;
      payment_id: string | null;
      subscription_id: string | null;
      template: string;
      message_type: string;
      origin: string;
      category: string;
      status: string;
      sender_mode: string | null;
      created_at: string;
      sent_at: string | null;
      delivered_at: string | null;
      read_at: string | null;
      failed_at: string | null;
      error_code: string | null;
    }>;
  };
  audit: Array<{
    id: number;
    record_id: string;
    table_name: string;
    action: string;
    changed_fields: string[] | null;
    at: string;
    actor_name: string | null;
  }>;
};

export async function getGymMemberDetail(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  memberId: string,
): Promise<MemberDetail> {
  const { data, error } = await supabase.rpc("admin_gym_member_detail", {
    p_organization_id: organizationId,
    p_member_id: memberId,
  });
  if (error) throw new Error(`Failed to load member detail: ${error.message}`);
  const raw = data as DetailJson;

  const memberships: MemberMembership[] = raw.memberships.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    planId: row.plan_id,
    planName: row.plan_name,
    startDate: row.start_date,
    endDate: row.end_date,
    state: row.state,
    status: row.status,
    agreedPriceMinor: row.agreed_price_minor,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
  const payments: MemberPayment[] = raw.payments.map((row) => ({
    id: row.id,
    subscriptionId: row.subscription_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    method: row.method,
    status: row.status,
    reference: row.reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    invoiceNumber: row.invoice_number,
    planName: row.plan_name,
    recordedByName: row.recorded_by_name,
    confirmedByName: row.confirmed_by_name,
    confirmedAt: row.confirmed_at,
    refundedByName: row.refunded_by_name,
    refundedAt: row.refunded_at,
    rejectedByName: row.rejected_by_name,
    rejectedAt: row.rejected_at,
    receiptStatus: row.receipt_status,
    receiptCreatedAt: row.receipt_created_at,
    receiptSentAt: row.receipt_sent_at,
    receiptDeliveredAt: row.receipt_delivered_at,
    receiptFailedAt: row.receipt_failed_at,
  }));
  const messages: MemberWhatsAppMessage[] = raw.whatsapp.messages.map((row) => ({
    id: row.id,
    paymentId: row.payment_id,
    subscriptionId: row.subscription_id,
    template: humanize(row.template),
    messageType: row.message_type,
    origin: row.origin,
    category: row.category,
    status: row.status,
    senderMode: row.sender_mode,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    failedAt: row.failed_at,
    errorCode: row.error_code,
  }));

  const member = {
    id: raw.member.id,
    organizationId: raw.member.organization_id,
    gymId: raw.member.gym_id,
    branchId: raw.member.branch_id,
    branchName: raw.member.branch_name,
    branchTimezone: raw.member.branch_timezone,
    name: [raw.member.first_name, raw.member.last_name].filter(Boolean).join(" "),
    email: raw.member.email,
    phone: raw.member.phone,
    status: raw.member.status,
    joinedOn: raw.member.joined_on,
    createdAt: raw.member.created_at,
    updatedAt: raw.member.updated_at,
    deletedAt: raw.member.deleted_at,
  };

  return {
    timezone: raw.timezone,
    member,
    memberships,
    payments,
    whatsapp: {
      sent: raw.whatsapp.summary.sent,
      delivered: raw.whatsapp.summary.delivered,
      failed: raw.whatsapp.summary.failed,
      lastMessageAt: raw.whatsapp.summary.last_message_at,
      lastTemplate: raw.whatsapp.summary.last_template ? humanize(raw.whatsapp.summary.last_template) : null,
      lastStatus: raw.whatsapp.summary.last_status,
      messages,
    },
    timeline: buildTimeline(member, memberships, payments, messages, raw.audit),
  };
}

function buildTimeline(
  member: MemberDetail["member"],
  memberships: MemberMembership[],
  payments: MemberPayment[],
  messages: MemberWhatsAppMessage[],
  audit: DetailJson["audit"],
): MemberTimelineEvent[] {
  const events: MemberTimelineEvent[] = [{ id: "member-created", label: "Member created", at: member.createdAt }];
  if (new Date(member.updatedAt).getTime() - new Date(member.createdAt).getTime() > 1_000) {
    events.push({ id: "member-updated", label: "Member updated", at: member.updatedAt });
  }
  if (member.deletedAt) events.push({ id: "member-deleted", label: "Member deleted", at: member.deletedAt });

  for (const membership of memberships) {
    events.push({
      id: `membership-created-${membership.id}`,
      label: `${membership.planName} membership created`,
      detail: `${formatCalendarDate(membership.startDate)} → ${formatCalendarDate(membership.endDate)}`,
      at: membership.createdAt,
    });
    if (membership.state === "upcoming") {
      events.push({ id: `membership-start-${membership.id}`, label: `${membership.planName} membership starts`, date: membership.startDate });
    }
    if (["active", "expiring_soon", "frozen", "upcoming"].includes(membership.state)) {
      events.push({ id: `membership-expiry-${membership.id}`, label: `${membership.planName} membership expires`, date: membership.endDate });
    }
  }

  for (const payment of payments) {
    events.push({
      id: `payment-${payment.id}`,
      label: "Payment recorded",
      detail: `${formatMinorWhole(payment.amountMinor, payment.currency)} · ${humanize(payment.method)}`,
      at: payment.createdAt,
    });
  }

  for (const entry of audit) {
    if (entry.action !== "UPDATE") continue;
    const fields = entry.changed_fields ?? [];
    const receiptGenerated = entry.table_name === "payments" && fields.includes("invoice_number");
    events.push({
      id: `audit-${entry.id}`,
      label: receiptGenerated ? "Receipt generated" : entry.table_name === "payments" ? "Payment updated" : "Membership changed",
      detail: [entry.actor_name ? `By ${entry.actor_name}` : null, fields.length ? humanize(fields.join(", ")) : null]
        .filter(Boolean)
        .join(" · ") || undefined,
      at: entry.at,
    });
  }

  for (const message of messages) {
    if (message.sentAt) events.push({ id: `wa-sent-${message.id}`, label: `WhatsApp ${message.template} sent`, at: message.sentAt });
    if (message.deliveredAt) events.push({ id: `wa-delivered-${message.id}`, label: `WhatsApp ${message.template} delivered`, at: message.deliveredAt });
    if (message.failedAt) events.push({ id: `wa-failed-${message.id}`, label: `WhatsApp ${message.template} failed`, detail: message.errorCode ? `Code ${message.errorCode}` : undefined, at: message.failedAt });
    if (!message.sentAt && !message.failedAt && ["queued", "processing"].includes(message.status)) {
      events.push({ id: `wa-queued-${message.id}`, label: `WhatsApp ${message.template} ${message.status}`, at: message.createdAt });
    }
  }

  return events
    .filter((event) => event.at || event.date)
    .sort((a, b) => eventSortValue(b) - eventSortValue(a))
    .slice(0, 200);
}

function eventSortValue(event: MemberTimelineEvent): number {
  return new Date(event.at ?? `${event.date}T00:00:00.000Z`).getTime();
}

export function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function describeMembership(member: MemberRow): string {
  if (!member.subscriptionEndDate) return "No active plan";
  const end = formatCalendarDate(member.subscriptionEndDate, false);
  switch (member.membershipState) {
    case "expiring_soon": return `Expiring soon · ${end}`;
    case "upcoming": return `Upcoming · ${member.subscriptionStartDate ? formatCalendarDate(member.subscriptionStartDate, false) : end}`;
    case "expired": return `Expired · ${end}`;
    case "cancelled": return `Cancelled · ${end}`;
    case "frozen": return `Frozen · ${end}`;
    case "active": return `Active · ${end}`;
    default: return "No active plan";
  }
}

export function describeLastPayment(member: MemberRow, timezone: string): string[] {
  if (!member.lastPayment) return ["No payments"];
  return [
    `${formatMinorWhole(member.lastPayment.amountMinor, member.lastPayment.currency)} · ${humanize(member.lastPayment.method)}`,
    formatZonedDateTime(member.lastPayment.at, timezone),
  ];
}
