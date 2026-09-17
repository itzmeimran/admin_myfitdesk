"use client";

import { useTransition } from "react";
import { downloadCsv } from "@/core/csv";
import { exportGymsCsv } from "@/features/gyms/actions";
import type { GymListParams } from "@/features/gyms/queries";
import { useToast } from "@/components/Toast";
import { ExportIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

// Kept here rather than exported from actions.ts: a "use server" file may
// only export async functions — a plain array export there broke every
// Server Action in that file on Vercel ("A 'use server' file can only
// export async functions, found object"). Must match exportGymsCsv's own
// row order in actions.ts.
const GYMS_CSV_HEADERS = [
  "Gym",
  "Owner",
  "Owner email",
  "City",
  "Package",
  "Billing period",
  "Status",
  "Members",
  "Member cap",
  "Branches",
  "Staff",
  "Renews",
  "Lifetime paid",
  "Created",
];

/** Exports every gym matching the current filters (not just the current
 * page — see exportGymsCsv's own docblock for why that needed a server
 * round trip once the list stopped loading everything into the browser). */
export function ExportGymsButton({ params }: { params: GymListParams }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportGymsCsv(params);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.rows.length === 0) {
        toast.error("No gyms to export.");
        return;
      }
      downloadCsv("gyms.csv", GYMS_CSV_HEADERS, result.rows);
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleExport}
      className="flex min-h-[36px] items-center gap-2 border-[1.5px] border-line bg-paper px-3 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
    >
      <ExportIcon size={ICON_SIZE.button} aria-hidden />
      {isPending ? "Exporting…" : "Export CSV"}
    </button>
  );
}
