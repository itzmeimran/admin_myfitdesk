import { ButtonLink } from "@/components/ButtonLink";

import { resolvePlatformAdmin } from "@/core/auth/get-platform-admin";
import { getAdminAccess } from "@/core/auth/access";
import { getAdminChromeCounts } from "@/features/overview/queries";
import { getSalesAttentionCount } from '@/features/sales/queries';
import { createClient } from "@/core/db/server-client";
import { ToastProvider } from "@/components/Toast";
import { ActionConfirmationProvider } from '@/components/ActionConfirmationProvider';
import { AdminSidebar } from "./admin-sidebar";
import { AdminChrome } from "./admin-chrome";
import { AdminLiveRefresh } from "./admin-live-refresh";

/**
 * Every /admin/* route sits behind this gate. resolvePlatformAdmin() is
 * fail-closed (see its docblock) — the RPC it calls doesn't exist on the
 * live project until supabase/migrations/1001_platform_admins.sql is
 * applied, so today this screen is what every user, including a genuine
 * future platform admin, actually sees. That's correct: a clear "not set
 * up yet" screen is the right failure mode for an unapplied migration,
 * not a silent grant.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await resolvePlatformAdmin();

  if (!result.authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sand px-4">
        <div className="flex w-full max-w-md flex-col items-center gap-5 border-[1.5px] border-ink bg-paper p-8 text-center">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center border-[1.5px] border-accent bg-accent/8 text-[22px] font-bold text-accent"
          >
            !
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[19px] leading-tight text-ink">
              Platform admin authorization isn&apos;t set up on this environment yet
            </h1>
            <p className="text-[13.5px] leading-relaxed text-mute">
              This account signed in, but the platform_admins table and the is_platform_admin()
              check it depends on haven&apos;t been applied to this Supabase project yet. Nobody is
              granted access until that migration ships and a row exists for you — see
              supabase/migrations/1001_platform_admins.sql.
            </p>
          </div>
          <p className="w-full border-t border-line pt-3 text-left text-[11px] text-mute3">
            Reason: <span className="font-mono">{result.reason}</span>
          </p>
          <ButtonLink
            href="/login"
            variant="secondary" size="lg" className="w-full"
          >
            Back to sign in
          </ButtonLink>
        </div>
      </main>
    );
  }

  const email = result.context.email ?? "platform admin";
  // Resolved by the database for THIS session (role -> permissions). A null
  // here would mean the gate passed but no access row exists — show nothing
  // rather than everything.
  const access = await getAdminAccess();
  const permissions: string[] = access?.permissions ?? [];
  const supabase = await createClient();
  const [{ gymsCount, alertsCount },salesAttentionCount] = await Promise.all([
    getAdminChromeCounts(supabase),permissions.includes('sales.view')?getSalesAttentionCount(supabase):Promise.resolve(null),
  ]);

  return (
    <ToastProvider>
      <ActionConfirmationProvider>
      <AdminLiveRefresh />
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <AdminSidebar email={email} gymsCount={gymsCount} salesAttentionCount={salesAttentionCount} permissions={permissions} />

        <div className="flex h-dvh flex-1 flex-col md:ml-[236px] md:min-w-0">
          <header className="flex flex-shrink-0 items-center gap-3 border-b-[1.5px] border-ink bg-paper px-4 py-3 md:px-6">
            <AdminChrome email={email} gymsCount={gymsCount} alertsCount={alertsCount} salesAttentionCount={salesAttentionCount} permissions={permissions} />
          </header>

          <main className="flex-1 overflow-y-auto bg-paper pb-24 md:pb-8">
            <div className="mfd-content-cap flex w-full flex-col px-4 py-5 md:px-6 md:py-6">{children}</div>
          </main>
        </div>
      </div>
      </ActionConfirmationProvider>
    </ToastProvider>
  );
}
