"use client";

import { useAdminEnvironment } from "@/core/env/context";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";

/**
 * Persistent, app-wide "which project am I looking at" tell — rendered in
 * both admin-chrome.tsx (mobile header) and admin-sidebar.tsx (desktop
 * rail), so it's visible on every admin screen, not just Settings. Task
 * requirement §5: make PROD impossible to miss. Pairs with the full-page
 * accent border in globals.css (`html[data-admin-env="prod"]`) — this pill
 * names it, the border makes it ambient.
 */
export function EnvironmentPill({ compact = false }: { compact?: boolean }) {
  const environment = useAdminEnvironment();
  const isProd = environment === "prod";

  return (
    <span
      className={`flex flex-shrink-0 items-center gap-1.5 border-[1.5px] font-bold uppercase tracking-[0.1em] ${
        compact ? "px-2 py-1 text-[9px]" : "px-2.5 py-1 text-[10px]"
      } ${isProd ? "border-accent bg-accent text-paper" : "border-mute3/40 bg-transparent text-mute3"}`}
      title={isProd ? "Live production data — changes are real." : "Development data — safe to experiment."}
    >
      <span
        aria-hidden="true"
        className={`h-[6px] w-[6px] flex-shrink-0 rounded-full ${isProd ? "bg-paper" : "bg-mute3"}`}
      />
      {ADMIN_ENVIRONMENT_LABEL[environment]}
    </span>
  );
}
