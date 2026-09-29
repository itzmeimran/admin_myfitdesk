import { createClient } from "@/core/db/server-client";
import { parsePagination } from "@/components/Pagination";
import { WhatsAppCreditsView } from "@/features/whatsapp-credits/WhatsAppCreditsView";
import {
  getWhatsAppProfitability,
  listWhatsAppCreditGyms,
  listWhatsAppCreditPackages,
} from "@/features/whatsapp-credits/queries";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function reportingRange(sp: RawSearchParams) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const rawFrom = first(sp.from);
  const rawTo = first(sp.to);
  const now = new Date();
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const monthStart = `${indiaDate.slice(0, 7)}-01T00:00:00+05:30`;
  const from = rawFrom && datePattern.test(rawFrom) ? `${rawFrom}T00:00:00+05:30` : monthStart;
  const to = rawTo && datePattern.test(rawTo)
    ? new Date(new Date(`${rawTo}T00:00:00+05:30`).getTime() + 86_400_000).toISOString()
    : now.toISOString();
  return { from, to };
}

export default async function WhatsAppCreditsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const search = first(sp.q);
  const { page, pageSize, offset } = parsePagination(sp);
  const supabase = await createClient();
  const [packages, { rows, total }, profitability] = await Promise.all([
    listWhatsAppCreditPackages(supabase),
    listWhatsAppCreditGyms(supabase, { search, limit: pageSize, offset }),
    getWhatsAppProfitability(supabase, reportingRange(sp)),
  ]);

  return (
    <WhatsAppCreditsView
      packages={packages}
      gyms={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      searchParams={sp}
      profitability={profitability}
    />
  );
}
