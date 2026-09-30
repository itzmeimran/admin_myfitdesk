import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { SkeletonBlock } from "@/components/Skeleton";
import {
  AccessSection,
  AlertsSection,
  CommandSection,
  DangerSection,
  DataSection,
  FlagsSection,
  HealthSection,
  JobsSection,
  LocksSection,
  ReconciliationSection,
  WebhooksSection,
  WhatsAppSection,
} from "./sections";

const SECTIONS = [
  { key: "command", label: "Command center" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "jobs", label: "Jobs" },
  { key: "webhooks", label: "Webhooks" },
  { key: "reconciliation", label: "Payments" },
  { key: "health", label: "Data health" },
  { key: "alerts", label: "Alerts" },
  { key: "access", label: "Access & security" },
  { key: "locks", label: "Restrictions" },
  { key: "flags", label: "Feature flags" },
  { key: "data", label: "Export & recovery" },
  { key: "danger", label: "Danger zone" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Operations tab. One section at a time (URL-driven, so every section has a
 * shareable link and works with the back button) — each section loads its own
 * data behind a Suspense boundary and fails independently, so a slow or broken
 * query never blanks the rest of the page.
 */
export default async function GymOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const requested = first(sp.section);
  const section: SectionKey = SECTIONS.some((s) => s.key === requested) ? (requested as SectionKey) : "command";

  const supabase = await createClient();
  const gym = await getGymDetail(supabase, id);
  if (!gym) notFound();
  const ctx = { supabase, gym, tz: gym.defaultTimezone || "Asia/Kolkata" };
  const base = `/admin/gyms/${gym.id}/operations`;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Operations sections" className="flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <Link
            key={s.key}
            href={`${base}?section=${s.key}`}
            aria-current={s.key === section ? "page" : undefined}
            className={`flex min-h-[34px] flex-shrink-0 items-center whitespace-nowrap border-[1.5px] px-3 text-[11px] font-bold uppercase tracking-[0.07em] ${
              s.key === section
                ? s.key === "danger"
                  ? "border-accent bg-accent text-paper"
                  : "border-ink bg-ink text-hi"
                : s.key === "danger"
                  ? "border-accent/50 text-accent hover:border-accent"
                  : "border-line text-mute hover:border-ink hover:text-ink"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <Suspense key={section} fallback={<SectionSkeleton />}>
        {section === "command" ? <CommandSection {...ctx} /> : null}
        {section === "whatsapp" ? <WhatsAppSection {...ctx} /> : null}
        {section === "jobs" ? <JobsSection {...ctx} /> : null}
        {section === "webhooks" ? <WebhooksSection {...ctx} /> : null}
        {section === "reconciliation" ? <ReconciliationSection {...ctx} /> : null}
        {section === "health" ? <HealthSection {...ctx} /> : null}
        {section === "alerts" ? <AlertsSection {...ctx} showResolved={first(sp.resolved) === "1"} /> : null}
        {section === "access" ? <AccessSection {...ctx} /> : null}
        {section === "locks" ? <LocksSection {...ctx} /> : null}
        {section === "flags" ? <FlagsSection {...ctx} /> : null}
        {section === "data" ? <DataSection {...ctx} /> : null}
        {section === "danger" ? <DangerSection {...ctx} /> : null}
      </Suspense>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading section">
      <SkeletonBlock className="h-[20px] w-[200px]" />
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[84px]" />
        ))}
      </div>
      <SkeletonBlock className="h-[180px]" />
    </div>
  );
}
