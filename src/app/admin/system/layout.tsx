import { requirePermission } from "@/core/auth/access";

/** Server-side section guard for /admin/system/* (Recovery). */
export default async function SystemGuardLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("recovery.view");
  return children;
}
