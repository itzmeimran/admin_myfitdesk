import { requirePermission } from "@/core/auth/access";

/** Server-side section guard: a role without `revenue.view` never reaches any page
 * under this segment, whatever URL it types. The nav link being hidden is only
 * a convenience. */
export default async function SectionGuardLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("revenue.view");
  return children;
}
