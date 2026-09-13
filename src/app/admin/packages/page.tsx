import { createClient } from "@/core/db/server-client";
import { getSimplePackage } from "@/features/plans/queries";
import { getBillingModel } from "@/features/settings/queries";
import { PackageView } from "./package-view";

/**
 * Packages — the one screen for what gym owners can buy.
 *
 * This product sells a single package on three terms (monthly, quarterly,
 * annual), with a discount that grows as the term does. That is the whole
 * model, so this is the whole screen: one price, two discounts, a set of
 * capacity limits, and a marketing feature list.
 *
 * Underneath it is the `plans` schema from
 * supabase/migrations/1008_plans_schema_and_rpcs.sql, which is deliberately
 * more general than that (many plans × many cycles × dated offers). The
 * generality stays in the database — it is what lets a term be repriced
 * without a deployment — but it is not put in front of the operator.
 *
 * The older Starter/Growth/Pro tier catalogue still exists at
 * /admin/packages/legacy; which of the two gym owners actually see is the
 * `billing_model` switch the banner on this page controls.
 */
export default async function PackagesPage() {
  const supabase = await createClient();
  const [{ pkg, otherPlanCount }, billingModel] = await Promise.all([
    getSimplePackage(supabase),
    getBillingModel(supabase),
  ]);

  return <PackageView pkg={pkg} billingModel={billingModel} otherPlanCount={otherPlanCount} />;
}
