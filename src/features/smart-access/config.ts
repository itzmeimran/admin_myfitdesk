/** Integration configuration states (mirrors the CHECK in FitDeskApp 0113). */
export const CONFIGURATION_STATUSES = ["pending_setup", "configuring", "connected", "verified", "failed", "suspended"] as const;
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];

export const CONFIGURATION_LABEL: Record<ConfigurationStatus, string> = {
  pending_setup: "Waiting for setup",
  configuring: "Configuring device",
  connected: "Connected (testing)",
  verified: "Verified",
  failed: "Setup failed",
  suspended: "Suspended",
};
