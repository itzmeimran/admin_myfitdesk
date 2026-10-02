"use client";

import { useCallback, useEffect } from "react";
import { istDateKey, millisecondsUntilIstMidnight } from "@/core/dates/ist";
import { useRouter } from "next/navigation";
import { requestRefresh } from "@/core/realtime/refresh-scheduler";
import { useBroadcastChannel } from "@/core/realtime/use-broadcast-channel";

/**
 * Directory-level realtime: keeps the sidebar gym count, the alerts badge and
 * whatever directory page is open (Gyms, Overview) current when a gym is
 * created, removed, or changes subscription state. Subscribes to the narrow
 * `admin:gyms` topic — which carries only `organizations` and
 * `organization_subscriptions` changes, not per-gym activity — so it stays
 * quiet no matter how busy individual gyms are. Renders nothing.
 *
 * Mounted once by admin/layout.tsx. Its refreshes share the process-wide
 * scheduler with the Gym Details channel, so one change reported on both
 * topics still costs one refresh.
 */
export function AdminLiveRefresh() {
  const router = useRouter();
  const onChange = useCallback(() => requestRefresh(router), [router]);
  useBroadcastChannel({ topic: "admin:gyms", onChange, onReconnected: onChange });
  useEffect(() => {
    let day = istDateKey();
    let timer: ReturnType<typeof setTimeout>;
    function checkDay() {
      const today = istDateKey();
      if (day !== today) {
        day = today;
        onChange();
      }
      clearTimeout(timer);
      timer = setTimeout(checkDay, millisecondsUntilIstMidnight() + 50);
    }
    checkDay();
    document.addEventListener("visibilitychange", checkDay);
    window.addEventListener("focus", checkDay);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkDay);
      window.removeEventListener("focus", checkDay);
    };
  }, [onChange]);
  return null;
}
