"use client";

import { PeriodSelector } from "@/components/PeriodSelector";
import { TabsNav } from "@/components/Tabs";
import { Toggle } from "@/components/Toggle";
import { useEffect, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/Dropdown";
import { requestRefresh } from "@/core/realtime/refresh-scheduler";
import { ENVIRONMENTS, RANGES } from "@/features/api-performance/params";

const BASE = "/admin/api-performance";
const TABS = [
  { href: BASE, label: "Overview", match: (p: string) => p === BASE },
  { href: `${BASE}/endpoints`, label: "Endpoints", match: (p: string) => p.startsWith(`${BASE}/endpoint`) },
  { href: `${BASE}/errors`, label: "Errors", match: (p: string) => p.startsWith(`${BASE}/errors`) },
  { href: `${BASE}/organizations`, label: "Organizations", match: (p: string) => p.startsWith(`${BASE}/organizations`) },
  { href: `${BASE}/requests`, label: "Request explorer", match: (p: string) => p.startsWith(`${BASE}/requests`) },
] as const;

const REFRESH_MS = 30_000;
const STORAGE_KEY = "api-performance-auto-refresh";

/**
 * Section tabs (shared `TabsNav`: segmented bar below `xl`, side rail from
 * `xl`). The range/env choice travels with every tab link.
 */
export function ApiTabs() {
  const pathname = usePathname();
  const search = useSearchParams();

  const tabHref = (base: string) => {
    const params = new URLSearchParams();
    for (const k of ["range", "env"]) {
      const v = search.get(k);
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const active = TABS.find((tab) => tab.match(pathname))?.href ?? "";
  return (
    <TabsNav
      ariaLabel="API Performance sections"
      activeKey={active}
      items={TABS.map((tab) => ({ key: tab.href, label: tab.label, href: tabHref(tab.href) }))}
    />
  );
}

/**
 * Section controls: time range, environment, and the live toggle.
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <PeriodSelector value={currentRange} ariaLabel="Time range" options={RANGES.map((r) => ({...r,href:pathname + "?" + carry({range:r.value})}))} />

        <div className="w-[140px]">
          <Dropdown
            ariaLabel="Environment"
            value={currentEnv}
            options={ENVIRONMENTS.map((e) => ({ value: e.value, label: e.label }))}
            onChange={(next) => router.push(`${pathname}?${carry({ env: next }).toString()}`)}
          />
        </div>

        <div className="flex min-h-[38px] items-center gap-2.5 border-[1.5px] border-line bg-paper py-1 pl-3 pr-1.5 text-[11.5px] font-bold text-mute sm:ml-auto">
          <span aria-hidden="true" className="relative flex h-2 w-2 flex-shrink-0">
            {live ? <span className="mfd-pulse-ring absolute inset-0 rounded-full bg-live" /> : null}
            <span className={`relative h-2 w-2 rounded-full ${live ? "bg-live" : "bg-mute3"}`} />
          </span>
          <span className={live ? "text-ink" : ""}>{live ? "Live" : "Paused"}</span>
          <span className="font-normal">{live ? "· updates every 30 s" : "· switch on to resume"}</span>
          <Toggle checked={live} onChange={toggleLive} ariaLabel="Automatic refresh" />
        </div>
      </div>
    </div>
  );
}
