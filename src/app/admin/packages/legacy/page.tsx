import { FEATURE_CHIPS } from "@/features/packages/mock-data";
import { listPackages } from "@/features/packages/queries";
import { createClient } from "@/core/db/server-client";
import { PackagesView } from "./packages-view";

/**
 * The retired Starter/Growth/Pro tier catalogue, kept reachable at
 * /admin/packages/legacy (not in the nav) because gym owners still see it
 * whenever platform_billing_settings.billing_model is 'legacy' — the
 * current package screen at /admin/packages is the replacement, and the
 * banner there is where the switch between them lives.
 *
 * Server Component reading the real catalogue (src/features/packages/
 * queries.ts) — both period sets at once, since the Monthly/Yearly toggle
 * is client-side state in PackagesView (no server round trip to switch it).
 *
 * FORM_FIELDS/FEATURE_CHIPS stay on mock-data.ts: they describe the "New
 * package" write form, which is out of scope for this read-only pass (see
 * NewPackageSheet's toast-only submit in packages-view.tsx).
 *
 * `?new=1` arrives from Overview's "New package" button (goNewPackage in
 * the design sets `screen: "packages", sheet: true` together — here
 * that's a route plus a query param the sheet reads on mount instead).
 */
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: openNew } = await searchParams;
  const supabase = await createClient();
  const [monthly, yearly] = await Promise.all([
    listPackages(supabase, "Monthly"),
    listPackages(supabase, "Yearly"),
  ]);

  return (
    <PackagesView
      monthly={monthly}
      yearly={yearly}
      featureChips={FEATURE_CHIPS}
      autoOpenSheet={openNew === "1"}
    />
  );
}
