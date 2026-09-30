import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/**
 * Platform-wide settings, stored one row per key in `platform_settings` and
 * validated by the database (app.validate_platform_setting) — the app never
 * decides what a legal value is, it only renders and submits.
 *
 * Who actually USES each value (so nothing here is decorative):
 *  - platformName / supportEmail / supportPhone: printed in the footer of the
 *    invitation emails this dashboard sends (gym owners and platform admins).
 *  - trialDays / country / currency / timezone: pre-fill the "Invite gym
 *    owner" form and are the server-side fallback when it is submitted blank.
 *  - graceDays: applied by the admin_create_gym_owner_invitation RPC to the new
 *    gym's subscription.
 * Gyms that already exist are never touched, and gyms that sign up on their own
 * in the main MyFitDesk app do not read these (that app owns its own signup).
 */
export type PlatformSettings = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  contactAddress: string;
  trialDays: number;
  graceDays: number;
  country: string;
  currency: string;
  timezone: string;
};

/** Mirrors app.platform_setting_defaults() — used only when the database can't
 * be asked (migration not applied yet). The database stays the source of
 * truth whenever it answers. */
export const FALLBACK_SETTINGS: PlatformSettings = {
  platformName: "MyFitDesk",
  supportEmail: "",
  supportPhone: "",
  contactAddress: "",
  trialDays: 14,
  graceDays: 7,
  country: "India",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

export const SETTING_KEYS = {
  platformName: "general.platform_name",
  supportEmail: "general.support_email",
  supportPhone: "general.support_phone",
  contactAddress: "general.contact_address",
  trialDays: "defaults.trial_days",
  graceDays: "defaults.grace_days",
  country: "defaults.country",
  currency: "defaults.currency",
  timezone: "defaults.timezone",
} as const satisfies Record<keyof PlatformSettings, string>;

type Row = {
  setting_key: string;
  setting_value: unknown;
  is_default: boolean;
  updated_at: string | null;
  updated_by_email: string | null;
};

export type SettingsProvenance = { at: string; by: string | null } | null;

export type SettingsSnapshot = {
  values: PlatformSettings;
  /** Latest save among the General keys / among the Platform-defaults keys. */
  general: SettingsProvenance;
  defaults: SettingsProvenance;
};

export async function getPlatformSettings(supabase: SupabaseClient<Database>): Promise<Loaded<SettingsSnapshot>> {
  const { data, error } = await loose(supabase).rpc("admin_get_platform_settings");
  if (error) return loadedFailure(error);

  const rows = (data ?? []) as Row[];
  const byKey = new Map(rows.map((row) => [row.setting_key, row]));
  const values: PlatformSettings = { ...FALLBACK_SETTINGS };
  for (const field of Object.keys(SETTING_KEYS) as (keyof PlatformSettings)[]) {
    const row = byKey.get(SETTING_KEYS[field]);
    if (row && row.setting_value !== null && row.setting_value !== undefined) {
      (values as Record<string, unknown>)[field] = row.setting_value;
    }
  }

  const latest = (prefix: string): SettingsProvenance => {
    const saved = rows.filter((row) => row.setting_key.startsWith(prefix) && !row.is_default && row.updated_at);
    if (!saved.length) return null;
    saved.sort((a, b) => ((a.updated_at as string) < (b.updated_at as string) ? 1 : -1));
    return { at: saved[0].updated_at as string, by: saved[0].updated_by_email };
  };

  return loaded({ values, general: latest("general."), defaults: latest("defaults.") });
}

/** For consumers that must never fail because Settings is unavailable (the
 * invite form, the invitation emails): the saved values, else the built-in
 * defaults. */
export async function getPlatformSettingsOrFallback(supabase: SupabaseClient<Database>): Promise<PlatformSettings> {
  const result = await getPlatformSettings(supabase);
  return result.ok ? result.data.values : FALLBACK_SETTINGS;
}
