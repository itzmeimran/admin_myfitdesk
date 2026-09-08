import { PACKAGES_M, PACKAGES_Y, FORM_FIELDS, FEATURE_CHIPS } from "@/features/packages/mock-data";
import { PackagesView } from "./packages-view";

/**
 * Server Component reading the mock-data module directly (both period sets
 * at once — the Monthly/Yearly toggle is client-side, so there's no server
 * round trip to switch it). Swapping PACKAGES_M/PACKAGES_Y for a real
 * `src/features/packages/queries.ts` read (platform_packages, grouped by
 * billing_period) is the only change this page needs later.
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

  return (
    <PackagesView
      monthly={PACKAGES_M}
      yearly={PACKAGES_Y}
      formFields={FORM_FIELDS}
      featureChips={FEATURE_CHIPS}
      autoOpenSheet={openNew === "1"}
    />
  );
}
