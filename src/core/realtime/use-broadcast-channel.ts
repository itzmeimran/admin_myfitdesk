"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/core/db/browser-client";
import { useAdminEnvironment } from "@/core/env/context";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";

type ChangePayload = { t?: string; op?: string; n?: number };

type Options = {
  /** Private Broadcast topic, e.g. `admin:gym:<organization_id>`. */
  topic: string;
  /** Called with the (content-free) payload of every `change` message. */
  onChange: (payload: ChangePayload) => void;
  /** Called after the channel re-joins following a drop — the moment to
   * reconcile anything that changed while it was down. */
  onReconnected?: () => void;
};

/**
 * Subscribes to ONE private Broadcast topic for as long as the calling
 * component is mounted, and reports connection health.
 *
 * - Exactly one channel per mount. The effect depends only on `topic` and the
 *   environment; handlers are read through refs, so re-renders and tab
 *   changes never tear down or duplicate the subscription.
 * - Cleanup removes the channel, so switching gyms (a new `topic`) or leaving
 *   the page leaves no subscription behind.
 * - supabase-js re-joins the channel on its own after a socket drop; we only
 *   translate its status callbacks into Live / Reconnecting / Offline, and
 *   fire `onReconnected` on every SUBSCRIBED after the first.
 * - Private channels are authorized by RLS on realtime.messages (platform
 *   admins only — see the 20260930120000 migration), so the session's JWT
 *   must be handed to the socket BEFORE joining: `realtime.setAuth()`.
 */
export function useBroadcastChannel({ topic, onChange, onReconnected }: Options): LiveStatus {
  const environment = useAdminEnvironment();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  const onChangeRef = useRef(onChange);
  const onReconnectedRef = useRef(onReconnected);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReconnectedRef.current = onReconnected;
  });

  useEffect(() => {
    let cancelled = false;
    let everLive = false;
    const supabase = createClient(environment);
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const online = () => (typeof navigator === "undefined" ? true : navigator.onLine);

    const handleOffline = () => setStatus("offline");
    const handleOnline = () => setStatus((s) => (s === "live" ? s : "reconnecting"));
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    void (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        // Fall through: the join below will fail visibly (Reconnecting)
        // rather than silently pretending to be live.
      }
      if (cancelled) return;

      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "change" }, ({ payload }) => {
          if (!cancelled) onChangeRef.current((payload ?? {}) as ChangePayload);
        })
        .subscribe((s) => {
          if (cancelled) return;
          if (s === "SUBSCRIBED") {
            setStatus(online() ? "live" : "offline");
            if (everLive) onReconnectedRef.current?.();
            everLive = true;
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setStatus(online() ? "reconnecting" : "offline");
          }
        });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [topic, environment]);

  return status;
}
