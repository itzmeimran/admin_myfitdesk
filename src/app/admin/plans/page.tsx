import { createClient } from "@/core/db/server-client";
import { listPlans } from "@/features/plans/queries";
import { PlansView } from "./plans-view";

/**
 * The dynamic Plans catalogue — additive alongside /admin/packages (the
 * legacy Starter/Growth/Pro screen, unchanged). Which one buyers actually
 * see is a separate global switch on /admin/settings
 * (platform_billing_settings.billing_model); this page is where the admin
 * builds and manages the dynamic side regardless of whether it's live yet.
 */
export default async function PlansPage() {
  const supabase = await createClient();
  const plans = await listPlans(supabase);

  return <PlansView plans={plans} />;
}
