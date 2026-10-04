import { SalesCrm, type SalesView } from "./sales-crm";
import { initialSales } from './actions';

const VIEWS: SalesView[] = ["board", "attn", "cov", "ana"];

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const current = VIEWS.find((v) => v === view) ?? "board";
  return <SalesCrm view={current} initial={await initialSales()} />;
}
