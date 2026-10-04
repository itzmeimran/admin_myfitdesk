import { requirePermission } from '@/core/auth/access';
export default async function SalesLayout({children}:{children:React.ReactNode}) {
 await requirePermission('sales.view');return children;
}
