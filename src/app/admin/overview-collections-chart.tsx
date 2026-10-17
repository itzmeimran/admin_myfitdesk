"use client";

import { useState } from "react";
import { ColumnBarChart } from "@/components/ColumnBarChart";
import { formatMinor, formatMinorWhole } from "@/core/money/format";
import { IST_TIME_ZONE } from "@/core/dates/ist";
import type { CollectionBucket } from "@/features/overview/model";

function amount(value: number, currency: string) { return value % 100 ? formatMinor(value, currency) : formatMinorWhole(value, currency); }
function dates(bucket: CollectionBucket) {
  const format = (value: string | number) => new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  const from = format(bucket.from), to = format(Date.parse(bucket.to) - 1);
  return from === to ? from : `${from} – ${to}`;
}

export function OverviewCollectionsChart({ buckets, currency }: { buckets: CollectionBucket[]; currency: string }) {
  const [inspected, setInspected] = useState<string | null>(null);
  const maximum = Math.max(1, ...buckets.map(bucket => bucket.amountMinor));
  const peak = buckets.findIndex(bucket => bucket.amountMinor === maximum);
  const active = buckets.find(bucket => bucket.key === inspected);
  const step = Math.max(1, Math.ceil(buckets.length / 6));
  return <div className="min-w-0">
    <p className="mb-2 min-h-8 text-[12px] text-mute" aria-live="polite">{active ? `${dates(active)} · ${amount(active.amountMinor, currency)}` : "Hover or focus a column for its exact collection amount."}</p>
    <ColumnBarChart height={136} label="Gross subscription collections by paid date" onInspect={setInspected} bars={buckets.map((bucket, index) => ({
      key: bucket.key, label: (index % step === 0 && index < buckets.length - step) || index === buckets.length - 1 ? bucket.label : "",
      valueLabel: index === peak ? amount(bucket.amountMinor, currency) : "", heightPct: bucket.amountMinor / maximum * 100,
      color: bucket.key === inspected ? "var(--accent)" : index === buckets.length - 1 ? "var(--hi)" : "var(--ink)",
      title: `${dates(bucket)}: ${amount(bucket.amountMinor, currency)} gross collections`,
    }))} />
    <details className="mt-3 text-[12px]">
      <summary className="cursor-pointer text-mute">View collection figures</summary>
      <div className="mt-2 max-h-48 overflow-auto border-t border-line"><table className="w-full text-left"><caption className="sr-only">Exact gross collections by period in IST</caption><thead><tr><th scope="col" className="py-2 font-medium">Period · IST</th><th scope="col" className="py-2 text-right font-medium">Collections</th></tr></thead><tbody>{buckets.map(bucket => <tr key={bucket.key} className="border-t border-line"><td className="py-1.5">{dates(bucket)}</td><td className="py-1.5 text-right tabular-nums">{amount(bucket.amountMinor, currency)}</td></tr>)}</tbody></table></div>
    </details>
  </div>;
}
