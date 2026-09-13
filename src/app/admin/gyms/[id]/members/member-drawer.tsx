"use client";

import { useState } from "react";
import type { MemberRow } from "@/features/gyms/members";
import { Sheet } from "@/components/Sheet";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";

const EXPIRY_PILL: Record<string, string> = {
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  none: "No plan",
};

/**
 * Member detail drawer, matching the design's slide-in panel. Shows every
 * fact `admin_gym_members()` already returns; "Membership history" and
 * "Payment history" (the design's two list sections inside the drawer) have
 * no admin-readable per-member RPC in this schema yet, so they say so
 * plainly rather than the drawer silently omitting them.
 */
export function MemberDrawer({ member, trigger }: { member: MemberRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const initials = member.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block truncate text-left font-bold hover:underline">
        {trigger}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} eyebrow="Platform admin view — read only" title={member.name}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-sand text-[12px] font-bold"
            >
              {initials}
            </span>
            <span className={PILL_CLASS} style={pillTone(EXPIRY_PILL[member.expiryState])}>
              {member.expiryLabel}
            </span>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-0 sm:grid-cols-2">
            <Fact label="Phone" value={member.phone ?? "—"} mono />
            <Fact label="Email" value={member.email ?? "—"} />
            <Fact label="Branch" value={member.branchName} />
            <Fact label="Current plan" value={member.planName} />
            <Fact label="Joined" value={member.joinedOn} />
            <Fact label="Member id" value={member.id} mono />
          </dl>

          <section className="flex flex-col gap-1.5 border-t border-line pt-3">
            <h3 className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute">Membership history</h3>
            <p className="text-[11.5px] leading-relaxed text-mute3">
              Not available yet — no per-member admin read of member_subscriptions exists in this schema today.
            </p>
          </section>

          <section className="flex flex-col gap-1.5 border-t border-line pt-3">
            <h3 className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-mute">Payment history</h3>
            <p className="text-[11.5px] leading-relaxed text-mute3">
              Not available yet — no per-member admin read of this gym&apos;s own payments exists in this schema today.
            </p>
          </section>
        </div>
      </Sheet>
    </>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-mute3">{label}</span>
      <span className={`break-words text-[12.5px] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
