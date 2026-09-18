/**
 * The two Supabase projects this admin app can point at. Deliberately a
 * closed, 2-value set (not an open string) — every place that switches
 * behavior by environment (client factories, the Settings toggle, the PROD
 * confirmation gate) is exhaustive over exactly these two, so adding a
 * third environment is a type-checked, not a silent, change.
 */
export const ADMIN_ENVIRONMENTS = ["dev", "prod"] as const;

export type AdminEnvironment = (typeof ADMIN_ENVIRONMENTS)[number];

/** New admin sessions (and any cookie that fails to parse) start on DEV —
 * never default to PROD, since defaulting to the safer, non-live project is
 * the only reasonable fail-closed choice for an environment switch. */
export const DEFAULT_ADMIN_ENVIRONMENT: AdminEnvironment = "dev";

export function isAdminEnvironment(value: string | undefined | null): value is AdminEnvironment {
  return value === "dev" || value === "prod";
}

export const ADMIN_ENVIRONMENT_LABEL: Record<AdminEnvironment, string> = {
  dev: "Development",
  prod: "Production",
};
