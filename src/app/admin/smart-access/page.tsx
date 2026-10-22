import { createClient } from "@/core/db/server-client";
import { hasPermission, requirePermission } from "@/core/auth/access";
import {
  listBiometricDevices,
  listSmartAccessPackages,
  listSmartAccessRequests,
  listUnclaimedDevices,
  type SmartAccessRequestStatus,
} from "@/features/smart-access/queries";
import { groupDevicesByGym } from "@/features/smart-access/devices";
import { SmartAccessAdminView } from "@/features/smart-access/SmartAccessAdminView";

const STATUSES = ["pending", "approved", "rejected", "all"] as const;

export default async function SmartAccessAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const access = await requirePermission("gyms.view");
  const sp = await searchParams;
  const filter = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "pending";
  const supabase = await createClient();
  const canViewPackages = hasPermission(access, "packages.view");
  const [requests, packages, devices, unclaimed, approved] = await Promise.all([
    listSmartAccessRequests(supabase, filter === "all" ? null : (filter as SmartAccessRequestStatus)),
    canViewPackages ? listSmartAccessPackages(supabase) : Promise.resolve({ rows: [], error: null }),
    listBiometricDevices(supabase),
    listUnclaimedDevices(supabase),
    // The gyms a waiting device can be linked to, whatever the list above is filtered to.
    listSmartAccessRequests(supabase, "approved"),
  ]);
  const devicesByGym = Object.fromEntries(groupDevicesByGym(devices.rows));
  const approvedGyms = [...new Map(approved.rows.map((r) => [r.organizationId, r.gymName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SmartAccessAdminView
      requests={requests.rows}
      packages={packages.rows}
      filter={filter}
      error={requests.error ?? packages.error}
      devicesByGym={devicesByGym}
      unclaimedDevices={unclaimed.rows}
      approvedGyms={approvedGyms}
      deviceError={devices.error ?? unclaimed.error}
      nowIso={new Date().toISOString()}
      canManage={hasPermission(access, "gyms.manage")}
      canManagePackages={hasPermission(access, "packages.manage")}
    />
  );
}
