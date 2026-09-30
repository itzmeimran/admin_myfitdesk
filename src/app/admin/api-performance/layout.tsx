import { Suspense } from "react";
import { getActiveAdminEnvironment } from "@/core/env/active-environment";
import { ApiToolbar } from "./api-toolbar";

/**
 * Platform Admin → API Performance. Shell for the five views. Authorization
 * is inherited from /admin/layout.tsx (fail-closed platform-admin gate) and
 * enforced again inside every admin_api_* RPC, so a gym owner's session
 * cannot read platform telemetry even by calling the RPCs directly.
 */
export default async function ApiPerformanceLayout({ children }: { children: React.ReactNode }) {
  const adminEnv = await getActiveAdminEnvironment();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">API Performance</h1>
        <p className="text-[12.5px] text-mute">
          How the platform&apos;s route handlers are behaving: volume, latency, failures and which gyms generate the load.
          Times shown in IST.
        </p>
      </div>
      <Suspense fallback={<div className="h-[88px]" />}>
        <ApiToolbar defaultEnv={adminEnv === "prod" ? "production" : "all"} />
      </Suspense>
      {children}
    </div>
  );
}
