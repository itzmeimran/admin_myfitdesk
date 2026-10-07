import type { AdminEnvironment } from "./environments";

/** Canonical tenant origin for the same project as the admin's session. */
export function tenantAppOrigin(environment: AdminEnvironment): string {
  return environment === "dev" ? "https://dev.myfitdesk.app" : "https://www.myfitdesk.app";
}
