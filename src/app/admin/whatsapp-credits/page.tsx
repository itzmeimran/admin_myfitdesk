import { createClient } from "@/core/db/server-client";
import { parsePagination } from "@/components/Pagination";
import { WhatsAppCreditsView } from "@/features/whatsapp-credits/WhatsAppCreditsView";
import { listWhatsAppCreditGyms, listWhatsAppCreditPackages } from "@/features/whatsapp-credits/queries";

type RawSearchParams = Record<string, string | string[] | undefined>;

export default async function WhatsAppCreditsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const search = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const { page, pageSize, offset } = parsePagination(sp);
  const supabase = await createClient();
  const [packages, { rows, total }] = await Promise.all([
    listWhatsAppCreditPackages(supabase),
    listWhatsAppCreditGyms(supabase, { search, limit: pageSize, offset }),
  ]);

  return (
    <WhatsAppCreditsView
      packages={packages}
      gyms={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      searchParams={sp}
    />
  );
}
