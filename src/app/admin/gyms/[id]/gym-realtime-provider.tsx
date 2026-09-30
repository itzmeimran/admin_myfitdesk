"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requestRefresh } from "@/core/realtime/refresh-scheduler";
import { useBroadcastChannel, type LiveStatus } from "@/core/realtime/use-broadcast-channel";
import { affectsCurrentView, sectionFromPathname } from "@/core/realtime/gym-events";

const GymRealtimeContext = createContext<LiveStatus>("connecting");

/** Connection health of this gym's realtime channel (for the Live indicator). */
export function useGymRealtimeStatus(): LiveStatus {
  return useContext(GymRealtimeContext);
}

/**
 * The single realtime controller for one open gym. Mounted once by
 * `[id]/layout.tsx`, which Next keeps alive while the admin moves between
 * Overview / Members / Branches & Team / Subscription & Billing / Activity —
 * so tab changes never create or destroy a subscription. Opening a different
 * gym unmounts it (its `key` is the organization id), which removes the old
 * channel before the new one joins: data from Gym A can never reach Gym B.
 *
 * Isolation is enforced twice: the topic embeds the organization id and the
 * database only ever sends that organization's changes to it, and the topic
 * itself is a private channel gated to platform admins by RLS on
 * realtime.messages.
 *
 * How an event becomes fresh data: the pages are server-rendered from admin
 * RPCs, so there is no client cache to patch. A message says "table X changed
 * for this gym"; `affectsCurrentView` decides whether the visible header/tab
 * reads that table, and if so one debounced `router.refresh()` re-runs just
 * this route's Server Components. Tabs that are not open are not fetched —
 * they load fresh when opened.
 */
export function GymRealtimeProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Tab changes must not resubscribe, so the current path is read via a ref.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const onChange = useCallback(
    (payload: { t?: string }) => {
      const current = sectionFromPathname(pathnameRef.current, organizationId);
      if (affectsCurrentView(payload.t, current)) requestRefresh(router);
    },
    [organizationId, router],
  );

  // After a drop, changes may have been missed: reconcile once.
  const onReconnected = useCallback(() => requestRefresh(router), [router]);

  const status = useBroadcastChannel({
    topic: `admin:gym:${organizationId}`,
    onChange,
    onReconnected,
  });

  return <GymRealtimeContext.Provider value={status}>{children}</GymRealtimeContext.Provider>;
}
