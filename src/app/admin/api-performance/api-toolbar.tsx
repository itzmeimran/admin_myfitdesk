"use client";

import { PeriodSelector } from "@/components/PeriodSelector";
import { ButtonLink } from "@/components/ButtonLink";
import { Button } from "@/components/Button";
import { useEffect, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown } from "@/components/Dropdown";
import { requestRefresh } from "@/core/realtime/refresh-scheduler";
import { ENVIRONMENTS, RANGES } from "@/features/api-performance/params";
import { ApiPerformanceIcon } from '@/core/ui/icons';

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
            <ButtonLink
              key={tab.href}
              href={tabHref(tab.href)}
              aria-current={active ? "page" : undefined}
              variant="ghost" layout="control" size="custom" className={`flex-shrink-0 whitespace-nowrap border-b-[3px] px-3.5 py-2.5 text-[12px] font-bold normal-case tracking-[0.06em] ${active ? "border-accent text-ink" : "border-transparent text-mute hover:text-ink"} `}
            >
              {tab.label}
            </ButtonLink>
          );
        })}
      </nav>

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

        <Button icon={ApiPerformanceIcon}
          type="button"
          role="switch"
          aria-checked={live}
          onClick={() => toggleLive(!live)}
          title={live ? "Click to pause automatic refresh" : "Click to resume automatic refresh"}
          variant="secondary" layout="control" size="custom" className="flex min-h-[38px] items-center gap-2.5 border-[1.5px] border-line bg-paper px-3 text-[11.5px] font-bold text-mute hover:border-ink sm:ml-auto"
        >
          <span aria-hidden="true" className="relative flex h-2 w-2 flex-shrink-0">
            {live ? <span className="mfd-pulse-ring absolute inset-0 rounded-full bg-live" /> : null}
            <span className={`relative h-2 w-2 rounded-full ${live ? "bg-live" : "bg-mute3"}`} />
          </span>
          <span className={live ? "text-ink" : ""}>{live ? "Live" : "Paused"}</span>
          <span className="font-normal">{live ? "· updates every 30 s" : "· click to resume"}</span>
        </Button>
      </div>
    </div>
  );
}
