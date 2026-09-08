import { FEATURE_CHIPS } from "@/features/packages/mock-data";
import { listPackages } from "@/features/packages/queries";
import { createClient } from "@/core/db/server-client";
import { PackagesView } from "./packages-view";

/**
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
