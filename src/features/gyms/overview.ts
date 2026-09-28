import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";

export type OverviewMessage = {
  id: string;
  recipient: string;
  phone: string;
  template: string;
  category: string;
  status: string;
  senderMode: string | null;
  metaMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  creditsUsed: number;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
};

export type GymOverview = {
  timezone: string;
  subscription: {
    lastPaymentMinor: number | null;
    lastPaymentAt: string | null;
    lifetimePaidMinor: number;
  };
  gymRevenue: {
    todayMinor: number;
    monthMinor: number;
    previousMonthMinor: number;
    lifetimeMinor: number;
    paymentsThisMonth: number;
    lastPaymentAt: string | null;
  };
  myFitDeskRevenue: {
    monthMinor: number;
    lifetimeMinor: number;
    lastPaymentAt: string | null;
  };
  whatsapp: {
    balance: number;
    lowCreditThreshold: number | null;
    sentToday: number;
    sentMonth: number;
    deliveredMonth: number;
    failedMonth: number;
    pending: number;
    utilityMonth: number;
    marketingMonth: number;
    creditsUsedMonth: number;
    lastMessageAt: string | null;
    stuckCount: number;
    lastSenderMode: string | null;
    connectionStatus: string | null;
    connectionError: string | null;
    lastWebhookAt: string | null;
    lastCreditPurchaseAt: string | null;
    lastCreditPurchaseMinor: number | null;
    latestFailure: { id: string; errorCode: string | null; errorMessage: string | null; at: string } | null;
    recentMessages: OverviewMessage[];
  };
  activity: {
    activeMemberships: number;
    expiring7d: number;
    expiredMemberships: number;
    newMembersMonth: number;
    paymentsMonth: number;
    lastMemberAddedAt: string | null;
    lastGymPaymentAt: string | null;
    lastOwnerActivityAt: string | null;
    lastGymActionAt: string | null;
    lastGymAction: string | null;
  };
  health: {
    scheduledFailures: number;
    automationFailuresMonth: number;
    lastAutomationAt: string | null;
    lastQueueDrainAt: string | null;
  };
  recentActivity: Array<{
    kind: string;
    label: string;
    amountMinor: number | null;
    currency: string | null;
    at: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    category: string | null;
    createdAt: string;
    createdByEmail: string | null;
  }>;
};

type RawOverview = {
  timezone: string;
  subscription: { last_payment_minor: number | null; last_payment_at: string | null; lifetime_paid_minor: number };
  gym_revenue: {
    today_minor: number; month_minor: number; previous_month_minor: number; lifetime_minor: number;
    payments_this_month: number; last_payment_at: string | null;
  };
  myfitdesk_revenue: { month_minor: number; lifetime_minor: number; last_payment_at: string | null };
  whatsapp: {
    balance: number; low_credit_threshold: number | null; sent_today: number; sent_month: number;
    delivered_month: number; failed_month: number; pending: number; utility_month: number;
    marketing_month: number; credits_used_month: number; last_message_at: string | null;
    stuck_count: number; last_sender_mode: string | null; connection_status: string | null;
    connection_error: string | null; last_webhook_at: string | null; last_credit_purchase_at: string | null;
    last_credit_purchase_minor: number | null;
    latest_failure: { id: string; error_code: string | null; error_message: string | null; at: string } | null;
    recent_messages: Array<{
      id: string; recipient: string; phone: string; template: string; category: string; status: string;
      sender_mode: string | null; meta_message_id: string | null; error_code: string | null;
      error_message: string | null; credits_used: number; created_at: string; sent_at: string | null;
      delivered_at: string | null; read_at: string | null;
    }>;
  };
  activity: {
    active_memberships: number; expiring_7d: number; expired_memberships: number; new_members_month: number;
    payments_month: number; last_member_added_at: string | null; last_gym_payment_at: string | null;
    last_owner_activity_at: string | null; last_gym_action_at: string | null; last_gym_action: string | null;
  };
  health: {
    scheduled_failures: number; automation_failures_month: number;
    last_automation_at: string | null; last_queue_drain_at: string | null;
  };
  recent_activity: Array<{ kind: string; label: string; amount_minor: number | null; currency: string | null; at: string }>;
  notes: Array<{
    id: string; content: string; category: string | null; created_at: string; created_by_email: string | null;
  }>;
};

export async function getGymOverview(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<GymOverview> {
  const { data, error } = await supabase.rpc("admin_gym_overview", { p_organization_id: organizationId });
  if (error) throw new Error(`Failed to load gym overview: ${error.message}`);
  const raw = (Array.isArray(data) ? data[0] : data) as RawOverview | null;
  if (!raw) throw new Error("The gym overview returned no data.");

  return {
    timezone: raw.timezone,
    subscription: {
      lastPaymentMinor: raw.subscription.last_payment_minor,
      lastPaymentAt: raw.subscription.last_payment_at,
      lifetimePaidMinor: raw.subscription.lifetime_paid_minor,
    },
    gymRevenue: {
      todayMinor: raw.gym_revenue.today_minor,
      monthMinor: raw.gym_revenue.month_minor,
      previousMonthMinor: raw.gym_revenue.previous_month_minor,
      lifetimeMinor: raw.gym_revenue.lifetime_minor,
      paymentsThisMonth: raw.gym_revenue.payments_this_month,
      lastPaymentAt: raw.gym_revenue.last_payment_at,
    },
    myFitDeskRevenue: {
      monthMinor: raw.myfitdesk_revenue.month_minor,
      lifetimeMinor: raw.myfitdesk_revenue.lifetime_minor,
      lastPaymentAt: raw.myfitdesk_revenue.last_payment_at,
    },
    whatsapp: {
      balance: raw.whatsapp.balance,
      lowCreditThreshold: raw.whatsapp.low_credit_threshold,
      sentToday: raw.whatsapp.sent_today,
      sentMonth: raw.whatsapp.sent_month,
      deliveredMonth: raw.whatsapp.delivered_month,
      failedMonth: raw.whatsapp.failed_month,
      pending: raw.whatsapp.pending,
      utilityMonth: raw.whatsapp.utility_month,
      marketingMonth: raw.whatsapp.marketing_month,
      creditsUsedMonth: raw.whatsapp.credits_used_month,
      lastMessageAt: raw.whatsapp.last_message_at,
      stuckCount: raw.whatsapp.stuck_count,
      lastSenderMode: raw.whatsapp.last_sender_mode,
      connectionStatus: raw.whatsapp.connection_status,
      connectionError: raw.whatsapp.connection_error,
      lastWebhookAt: raw.whatsapp.last_webhook_at,
      lastCreditPurchaseAt: raw.whatsapp.last_credit_purchase_at,
      lastCreditPurchaseMinor: raw.whatsapp.last_credit_purchase_minor,
      latestFailure: raw.whatsapp.latest_failure
        ? {
            id: raw.whatsapp.latest_failure.id,
            errorCode: raw.whatsapp.latest_failure.error_code,
            errorMessage: raw.whatsapp.latest_failure.error_message,
            at: raw.whatsapp.latest_failure.at,
          }
        : null,
      recentMessages: (raw.whatsapp.recent_messages ?? []).map((message) => ({
        id: message.id,
        recipient: message.recipient,
        phone: message.phone,
        template: message.template,
        category: message.category,
        status: message.status,
        senderMode: message.sender_mode,
        metaMessageId: message.meta_message_id,
        errorCode: message.error_code,
        errorMessage: message.error_message,
        creditsUsed: message.credits_used,
        createdAt: message.created_at,
        sentAt: message.sent_at,
        deliveredAt: message.delivered_at,
        readAt: message.read_at,
      })),
    },
    activity: {
      activeMemberships: raw.activity.active_memberships,
      expiring7d: raw.activity.expiring_7d,
      expiredMemberships: raw.activity.expired_memberships,
      newMembersMonth: raw.activity.new_members_month,
      paymentsMonth: raw.activity.payments_month,
      lastMemberAddedAt: raw.activity.last_member_added_at,
      lastGymPaymentAt: raw.activity.last_gym_payment_at,
      lastOwnerActivityAt: raw.activity.last_owner_activity_at,
      lastGymActionAt: raw.activity.last_gym_action_at,
      lastGymAction: raw.activity.last_gym_action,
    },
    health: {
      scheduledFailures: raw.health.scheduled_failures,
      automationFailuresMonth: raw.health.automation_failures_month,
      lastAutomationAt: raw.health.last_automation_at,
      lastQueueDrainAt: raw.health.last_queue_drain_at,
    },
    recentActivity: (raw.recent_activity ?? []).map((event) => ({
      kind: event.kind,
      label: event.label,
      amountMinor: event.amount_minor,
      currency: event.currency,
      at: event.at,
    })),
    notes: (raw.notes ?? []).map((note) => ({
      id: note.id,
      content: note.content,
      category: note.category,
      createdAt: note.created_at,
      createdByEmail: note.created_by_email,
    })),
  };
}

export async function getGymWhatsAppHistory(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  params: { status?: string; limit?: number; offset?: number },
): Promise<{ rows: OverviewMessage[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_gym_whatsapp_messages", {
    p_organization_id: organizationId,
    p_status: params.status || undefined,
    p_limit: params.limit ?? 25,
    p_offset: params.offset ?? 0,
  });
  if (error) throw new Error(`Failed to load WhatsApp history: ${error.message}`);

  return {
    total: data?.[0]?.total_count ?? 0,
    rows: (data ?? []).map((message) => ({
      id: message.id,
      recipient: message.recipient,
      phone: message.phone_number_e164,
      template: message.template,
      category: message.category,
      status: message.status,
      senderMode: message.sender_mode,
      metaMessageId: message.meta_message_id,
      errorCode: message.error_code,
      errorMessage: message.error_message,
      creditsUsed: message.credits_used,
      createdAt: message.created_at,
      sentAt: message.sent_at,
      deliveredAt: message.delivered_at,
      readAt: message.read_at,
    })),
  };
}
