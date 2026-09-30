"use client";

import { useGymRealtimeStatus } from "./gym-realtime-provider";

const COPY = {
  connecting: { label: "Connecting", dot: "bg-mute3", title: "Connecting to live updates" },
  live: { label: "Live", dot: "bg-live", title: "This gym updates automatically" },
  reconnecting: {
    label: "Reconnecting",
    dot: "bg-hi",
    title: "Live updates dropped; reconnecting. Data will resync when it returns.",
  },
  offline: { label: "Offline", dot: "bg-accent", title: "You are offline. Data will resync when you reconnect." },
} as const;

/** Subtle connection indicator for Gym Details: a dot and one word. */
export function LiveIndicator() {
  const status = useGymRealtimeStatus();
  const { label, dot, title } = COPY[status];
  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute"
    >
      <span aria-hidden="true" className="relative flex h-2 w-2 flex-shrink-0">
        {status === "live" ? <span className="mfd-pulse-ring absolute inset-0 rounded-full bg-live" /> : null}
        <span className={`relative h-2 w-2 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}
