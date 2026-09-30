"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { requestRefresh } from "@/core/realtime/refresh-scheduler";
import { ENVIRONMENTS, RANGES } from "@/features/api-performance/params";

const BASE = "/admin/api-performance";
const TABS = [
  { href: BASE, label: "Overview", match: (p: string) => p === BASE },
  { href: `${BASE}/endpoints`, label: "Endpoints", match: (p: string) => p.startsWith(`${BASE}/endpoint`) },
  { href: `${BASE}/errors`, label: "Errors", match: (p: string) => p.startsWith(`${BASE}/errors`) },
  { href: `${BASE}/organizations`, label: "Organizations", match: (p: string) => p.startsWith(`${BASE}/organizations`) },
  { href: `${BASE}/requests`, label: "Request Explorer", match: (p: string) => p.startsWith(`${BASE}/requests`) },
] as const;

const REFRESH_MS = 30_000;
const STORAGE_KEY = "api-performance-auto-refresh";

/**
 * Section chrome: tabs, time range, environment, and the live toggle.
 * Everything is URL state (range/env travel with every tab), matching the
 * rest of the admin app's "the URL is the state" pattern.
 *
 * Live updating is a deliberately light refresh, not per-request realtime:
 * telemetry is written in batches at request volume, so broadcasting every
 * insert would make the monitor itself a load source. Instead the page
 * re-renders on the shared debounced scheduler every 30 s, and only while
 * this browser tab is visible — a hidden or idle tab costs nothing.
 */
export function ApiToolbar({ defaultEnv }: { defaultEnv: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const [live, setLive] = useState(true);

  useEffect(() => {
    // Read after mount (not in the initial state) so server and first client
    // render agree; localStorage has no non-effect equivalent here.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(STORAGE_KEY) === "off") setLive(false);
    } catch {
      /* storage unavailable — default on */
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (!document.hidden) requestRefresh(router);
    };
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  function toggleLive(next: boolean) {
    setLive(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      /* per-viewer convenience only */
    }
  }

  const currentRange = search.get("range") ?? "24h";
  const currentEnv = search.get("env") ?? defaultEnv;

  const carry = (extra: Record<string, string | null>) => {
    const params = new URLSearchParams(search.toString());
    params.delete("page");
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return params;
  };

  const tabHref = (base: string) => {
    const params = new URLSearchParams();
    for (const k of ["range", "env"]) {
      const v = search.get(k);
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="API Performance sections" className="flex overflow-x-auto border-b-[1.5px] border-ink">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tabHref(tab.href)}
              aria-current={active ? "page" : undefined}
              className={`flex-shrink-0 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] ${
                active ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Time range" className="flex border-[1.5px] border-ink">
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`${pathname}?${carry({ range: r.value }).toString()}`}
              aria-current={currentRange === r.value ? "true" : undefined}
              className={`px-3 py-2 text-[11.5px] font-bold ${currentRange === r.value ? "bg-ink text-paper" : "text-ink hover:bg-sand"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>

        <select
          aria-label="Environment"
          value={currentEnv}
          onChange={(e) => router.push(`${pathname}?${carry({ env: e.target.value }).toString()}`)}
          className="min-h-[36px] cursor-pointer border-[1.5px] border-line bg-paper px-2.5 text-[12px] font-bold text-ink outline-none transition-colors hover:border-ink focus:border-ink"
        >
          {ENVIRONMENTS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11.5px] font-bold text-mute">
          <input type="checkbox" checked={live} onChange={(e) => toggleLive(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-1.5 w-1.5 ${live ? "bg-ink mfd-live-dot" : "bg-mute3"}`} />
            {live ? "Live · refreshes every 30 s" : "Live updates paused"}
          </span>
        </label>
      </div>
    </div>
  );
}
