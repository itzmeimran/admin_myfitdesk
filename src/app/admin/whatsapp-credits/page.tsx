import { createClient } from "@/core/db/server-client";
import { parsePagination } from "@/components/Pagination";
import { WhatsAppCreditsView } from "@/features/whatsapp-credits/WhatsAppCreditsView";
import {
  listWhatsAppCreditGyms,
  listWhatsAppCreditPackages,
} from "@/features/whatsapp-credits/queries";

import { getMetaSpending } from "@/features/whatsapp-credits/meta-spend";
import { requirePermission } from "@/core/auth/access";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WhatsAppCreditsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePermission("whatsapp.view");
  const sp = await searchParams;
  const search = first(sp.q);
  const { page, pageSize, offset } = parsePagination(sp);
  const supabase = await createClient();
  const [packages, { rows, total }, spending] = await Promise.all([
    listWhatsAppCreditPackages(supabase),
    listWhatsAppCreditGyms(supabase, { search, limit: pageSize, offset }),
    getMetaSpending({ period: first(sp.period), from: first(sp.from), to: first(sp.to) }),
  ]);

  return (
    <WhatsAppCreditsView
      packages={packages}
      gyms={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      searchParams={sp}
      spending={spending}
    />
  );
}
