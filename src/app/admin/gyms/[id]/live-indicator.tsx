"use client";

import { useGymRealtimeStatus } from "./gym-realtime-provider";

const COPY = {
  connecting: { label: "Connecting", dot: "bg-mute3", title: "Connecting to live updates" },
  live: { label: "Live", dot: "bg-ink", title: "This gym updates automatically" },
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
      <span aria-hidden="true" className={`h-1.5 w-1.5 ${dot} ${status === "live" ? "mfd-live-dot" : ""}`} />
      {label}
    </span>
  );
}
