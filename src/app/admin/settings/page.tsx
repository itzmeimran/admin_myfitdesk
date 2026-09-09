import { createClient } from "@/core/db/server-client";
import { listPlatformAdmins } from "@/features/settings/queries";
import { SettingsView } from "./settings-view";

/**
 * Of the design's 4 candidate Settings features (grace-period default,
 * invoice prefix, webhook endpoints, admin accounts — see the original
 * placeholder this replaced), the product owner chose to build only the
 * admin roster (CLAUDE.md's Plan, P2 #8). The other three remain
 * undecided/unbuilt — this page has no section for them yet, rather than a
 * disabled placeholder for something that was never designed.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const admins = await listPlatformAdmins(supabase);

  return <SettingsView admins={admins} />;
}
