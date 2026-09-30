import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/core/db/database.types";
import { loose } from "@/core/db/loose-client";
import { getPublicSupabaseCredentials } from "@/core/config/public";
import { isEmailConfigured } from "@/core/config/email";
import { isR2TargetConfigured, resolveR2RolloutMode, type R2RolloutMode } from "@/core/storage/r2-client";
import type { AdminEnvironment } from "@/core/config/environments";
import { loaded, loadedFailure, type Loaded } from "./rpc-result";

/**
 * Settings → Integrations. SAFE METADATA ONLY: whether a credential is
 * configured on this deployment (a boolean), counts and timestamps from our own
 * tables. No key, token, password or connection string is read into anything
 * that reaches the browser — the env vars are only tested for presence, and the
 * database health RPC returns aggregates, never payloads.
 */

export type WebhookHealth = {
  provider: string;
  last_received_at: string | null;
  events_24h: number;
  signature_failures_24h: number;
  processing_errors_24h: number;
};

export type IntegrationHealth = {
  webhooks: WebhookHealth[];
  whatsapp: { total: number; connected: number; with_error: number; last_webhook_at: string | null; tokens_expiring_7d: number };
  gateways: { total: number; connected: number; with_error: number };
  email: { sent_24h: number; failed_24h: number; last_sent_at: string | null; last_failed_at: string | null };
};

export async function getIntegrationHealth(supabase: SupabaseClient<Database>): Promise<Loaded<IntegrationHealth>> {
  const { data, error } = await loose(supabase).rpc("admin_integration_health");
  if (error) return loadedFailure(error);
  return loaded(data as IntegrationHealth);
}

export type DeploymentConfig = {
  supabaseHost: string;
  smtpConfigured: boolean;
  r2: { legacy: boolean; public: boolean; private: boolean; rolloutMode: R2RolloutMode };
  backupDispatchConfigured: boolean;
  cronSecretConfigured: boolean;
};

/** What THIS deployment has configured. Presence checks only. */
export function getDeploymentConfig(environment: AdminEnvironment): DeploymentConfig {
  let supabaseHost = "unknown";
  try {
    supabaseHost = new URL(getPublicSupabaseCredentials(environment).url).hostname;
  } catch {
    // leave "unknown"
  }
  return {
    supabaseHost,
    smtpConfigured: isEmailConfigured(),
    r2: {
      legacy: isR2TargetConfigured("legacy"),
      public: isR2TargetConfigured("public"),
      private: isR2TargetConfigured("private"),
      rolloutMode: resolveR2RolloutMode(),
    },
    backupDispatchConfigured: Boolean(process.env.BACKUP_GITHUB_TOKEN?.trim() && process.env.BACKUP_GITHUB_REPOSITORY?.trim()),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
  };
}
