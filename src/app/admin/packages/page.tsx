import { createClient } from "@/core/db/server-client";
import { listSimplePackages } from "@/features/plans/queries";
import { getBillingModel } from "@/features/settings/queries";
import { PackageView } from "./package-view";

/**
 * Packages — every package gym owners can buy, and the one place they're
 * all managed from.
 *
 * Each package sells on up to four terms (monthly, quarterly, half-yearly,
 * annual), with a discount that grows as the term does — that per-package
 * model is unchanged from the original single-package screen. What changed
 * is that this screen no longer assumes there is only one: a row of cards
 * picks which package is being edited, and the selected one carries a
 * terracotta (--accent) border. `?pkg=<id>` is the selection, so it's a
 * shareable, reloadable URL like every other admin list in this app;
 * `?pkg=new` opens the create form.
 *
 * Underneath it is the `plans` schema from
 * supabase/migrations/1008_plans_schema_and_rpcs.sql, which is deliberately
 * more general than this screen shows (many plans × many cycles × dated
 * offers) — the generality stays in the database, it is what lets a term be
 * repriced or a new package added without a deployment.
 *
 * The older Starter/Growth/Pro tier catalogue still exists at
 * /admin/packages/legacy; which of the two gym owners actually see is the
 * `billing_model` switch the banner on this page controls.
 */
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ pkg?: string }>;
}) {
  const supabase = await createClient();
  const [packages, billingModel] = await Promise.all([listSimplePackages(supabase), getBillingModel(supabase)]);

  const requested = (await searchParams).pkg ?? null;
  const activeFirst = packages.find((p) => p.status === "active") ?? packages[0] ?? null;
  const selectedId =
    requested === "new"
      ? "new"
      : requested && packages.some((p) => p.id === requested)
        ? requested
        : (activeFirst?.id ?? "new");

  return <PackageView packages={packages} selectedId={selectedId} billingModel={billingModel} />;
}
