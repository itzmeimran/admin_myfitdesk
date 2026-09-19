import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import type { GymStatus } from "./mock-data";

/**
 * Gym Detail page (Platform Admin → Gyms → [Gym Name]) — reads
 * `admin_gym_detail()` (supabase/migrations/1009_admin_gym_detail.sql), one
 * jsonb round trip carrying the organization record, its owner, its
 * subscription, usage vs caps, lifetime platform revenue, and its plan's
 * feature list. Every tab under `/admin/gyms/[id]/*` reads this once (via
 * the shared layout) for the header; each tab's own data (branches, staff,
 * members, billing history, audit log) is its own paginated RPC, read only
 * by that tab's page.
 */

type AdminGymDetailJson = {
  organization: {
    id: string;
    name: string;
    slug: string;
    gym_code: string;
    city: string | null;
    state: string | null;
    country: string | null;
    address_line: string | null;
    postal_code: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    default_timezone: string;
    default_currency: string;
    logo_url: string | null;
    grace_period_days: number;
    week_start: string;
    opens_at: string | null;
    closes_at: string | null;
    created_at: string;
    updated_at: string;
    deletion_requested_at: string | null;
    suspended_at: string | null;
    suspension_reason: string | null;
  };
  owner: { staff_id: string; name: string; email: string; phone: string | null } | null;
  subscription: {
    package_id: string | null;
    package_name: string | null;
    package_code: string | null;
    // Widened from "monthly" | "yearly" — dynamic plan cycles (supabase/
    // migrations/1008_plans_schema_and_rpcs.sql) carry an arbitrary
    // admin-defined label, not just the legacy two.
    billing_period: string | null;
    price_minor: number | null;
    currency: string | null;
    status: string;
    state: "trialing" | "active" | "grace" | "read_only" | "cancelled";
    current_period_start: string | null;
    current_period_end: string | null;
    grace_days: number;
    auto_renew: boolean;
    cancelled_at: string | null;
    created_at: string;
    // migration 1013 — a package queued (via "Change package" while the
    // gym is still inside a live period) to take over at period_start,
    // which is always the current subscription's own period_end. Null
    // when nothing is queued.
    pending: {
      package_id: string;
      package_name: string | null;
      package_code: string | null;
      billing_period: string | null;
      price_minor: number | null;
      currency: string | null;
      period_start: string;
      period_end: string;
    } | null;
  } | null;
  usage: {
    member_count: number;
    branch_count: number;
    staff_count: number;
    member_cap: number | null;
    branch_cap: number | null;
    staff_cap: number | null;
  };
  lifetime_paid_minor: number;
  features: string[];
};

const STATE_TO_STATUS: Record<string, GymStatus> = {
  trialing: "Trialing",
  active: "Active",
  grace: "Grace",
  read_only: "Read-only",
  cancelled: "Cancelled",
};

export type GymDetail = {
  id: string;
  name: string;
  slug: string;
  /** Human-readable business id (FitDeskApp migration 0066's `gym_code`,
   * e.g. "GG-0926A") — the user-facing "Gym ID", never the raw Supabase
   * UUID. */
  gymCode: string;
  city: string | null;
  state: string | null;
  country: string | null;
  addressLine: string | null;
  postalCode: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultTimezone: string;
  defaultCurrency: string;
  logoUrl: string | null;
  gracePeriodDays: number;
  weekStart: string;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletionRequestedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  status: GymStatus;
  owner: { staffId: string; name: string; email: string; phone: string | null } | null;
  subscription: {
    packageId: string | null;
    packageName: string | null;
    packageCode: string | null;
    billingPeriod: string | null;
    priceMinor: number | null;
    currency: string | null;
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    graceDays: number;
    autoRenew: boolean;
    cancelledAt: string | null;
    createdAt: string;
    pending: {
      packageId: string;
      packageName: string | null;
      packageCode: string | null;
      billingPeriod: string | null;
      priceMinor: number | null;
      currency: string | null;
      periodStart: string;
      periodEnd: string;
    } | null;
  } | null;
  usage: {
    memberCount: number;
    branchCount: number;
    staffCount: number;
    memberCap: number | null;
    branchCap: number | null;
    staffCap: number | null;
  };
  lifetimePaidMinor: number;
  features: string[];
};

export async function getGymDetail(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<GymDetail | null> {
  const { data, error } = await supabase.rpc("admin_gym_detail", { p_organization_id: organizationId });
  if (error) {
    if (error.code === "PGRST116" || error.message.includes("Gym not found")) return null;
    throw new Error(`Failed to load the gym: ${error.message}`);
  }

  const raw = (Array.isArray(data) ? data[0] : data) as AdminGymDetailJson | null;
  if (!raw) return null;

  const o = raw.organization;
  const status: GymStatus = o.suspended_at
    ? "Suspended"
    : (STATE_TO_STATUS[raw.subscription?.state ?? "active"] ?? "Active");

  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    gymCode: o.gym_code,
    city: o.city,
    state: o.state,
    country: o.country,
    addressLine: o.address_line,
    postalCode: o.postal_code,
    contactEmail: o.contact_email,
    contactPhone: o.contact_phone,
    defaultTimezone: o.default_timezone,
    defaultCurrency: o.default_currency,
    logoUrl: o.logo_url,
    gracePeriodDays: o.grace_period_days,
    weekStart: o.week_start,
    opensAt: o.opens_at,
    closesAt: o.closes_at,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    deletionRequestedAt: o.deletion_requested_at,
    suspendedAt: o.suspended_at,
    suspensionReason: o.suspension_reason,
    status,
    owner: raw.owner
      ? { staffId: raw.owner.staff_id, name: raw.owner.name, email: raw.owner.email, phone: raw.owner.phone }
      : null,
    subscription: raw.subscription
      ? {
          packageId: raw.subscription.package_id,
          packageName: raw.subscription.package_name,
          packageCode: raw.subscription.package_code,
          billingPeriod: raw.subscription.billing_period,
          priceMinor: raw.subscription.price_minor,
          currency: raw.subscription.currency,
          status: raw.subscription.status,
          currentPeriodStart: raw.subscription.current_period_start,
          currentPeriodEnd: raw.subscription.current_period_end,
          graceDays: raw.subscription.grace_days,
          autoRenew: raw.subscription.auto_renew,
          cancelledAt: raw.subscription.cancelled_at,
          createdAt: raw.subscription.created_at,
          pending: raw.subscription.pending
            ? {
                packageId: raw.subscription.pending.package_id,
                packageName: raw.subscription.pending.package_name,
                packageCode: raw.subscription.pending.package_code,
                billingPeriod: raw.subscription.pending.billing_period,
                priceMinor: raw.subscription.pending.price_minor,
                currency: raw.subscription.pending.currency,
                periodStart: raw.subscription.pending.period_start,
                periodEnd: raw.subscription.pending.period_end,
              }
            : null,
        }
      : null,
    usage: {
      memberCount: raw.usage.member_count,
      branchCount: raw.usage.branch_count,
      staffCount: raw.usage.staff_count,
      memberCap: raw.usage.member_cap,
      branchCap: raw.usage.branch_cap,
      staffCap: raw.usage.staff_cap,
    },
    lifetimePaidMinor: raw.lifetime_paid_minor,
    features: raw.features ?? [],
  };
}
