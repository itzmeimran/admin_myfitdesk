"use client";

import { useState } from "react";
import type { BranchRow } from "@/features/gyms/branches";
import { Sheet } from "@/components/Sheet";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";

/**
 * "Clicking a branch should allow the Platform Admin to inspect branch
 * details" (task brief §5) — a branch has no data beyond what
 * `admin_gym_branches()` already returns (there's no branch-specific
 * sub-entity like a subscription or an audit trail to justify a whole
 * nested route), so this opens a focused detail panel over the same row
 * rather than a third level of nested pages under /admin/gyms/[id]/....
 */
export function BranchRowDetail({ branch, trigger }: { branch: BranchRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block truncate text-left font-bold hover:underline">
        {trigger}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} eyebrow="branches" title={branch.name}>
        <dl className="flex flex-col gap-2 text-[12.5px]">
          <Row k="Status">
            <span className={PILL_CLASS} style={pillTone(branch.status === "active" ? "Active" : "Cancelled")}>
              {branch.status}
            </span>
          </Row>
          <Row k="Members"><span className="font-bold">{branch.memberCount.toLocaleString("en-IN")}</span></Row>
          <Row k="Staff"><span className="font-bold">{branch.staffCount.toLocaleString("en-IN")}</span></Row>
          <Row k="Timezone"><span className="font-bold">{branch.timezone}</span></Row>
          <Row k="Currency"><span className="font-bold">{branch.currency}</span></Row>
          <Row k="Created"><span className="font-bold">{branch.createdAt}</span></Row>
        </dl>
      </Sheet>
    </>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-1.5">
      <dt className="text-mute">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
