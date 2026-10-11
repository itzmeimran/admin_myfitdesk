import { createClient } from "@/core/db/server-client";
import { hasPermission, requirePermission } from "@/core/auth/access";
import { listSmartAccessPackages, listSmartAccessRequests, type SmartAccessRequestStatus } from "@/features/smart-access/queries";
import { SmartAccessAdminView } from "@/features/smart-access/SmartAccessAdminView";

const STATUSES = ["pending", "approved", "rejected", "all"] as const;

export default async function SmartAccessAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const access = await requirePermission("gyms.view");
  const sp = await searchParams;
  const filter = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUSES)[number]) : "pending";
  const supabase = await createClient();
  const canViewPackages = hasPermission(access, "packages.view");
  const [requests, packages] = await Promise.all([
    listSmartAccessRequests(supabase, filter === "all" ? null : (filter as SmartAccessRequestStatus)),
    canViewPackages ? listSmartAccessPackages(supabase) : Promise.resolve({ rows: [], error: null }),
  ]);

  return (
    <SmartAccessAdminView
      requests={requests.rows}
      packages={packages.rows}
      filter={filter}
      error={requests.error ?? packages.error}
      canManage={hasPermission(access, "gyms.manage")}
      canManagePackages={hasPermission(access, "packages.manage")}
    />
  );
}
