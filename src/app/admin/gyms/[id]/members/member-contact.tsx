"use client";

import { useState } from "react";
import { RevealIcon, HideIcon } from "@/core/ui/icons";

/**
 * Reveal/hide toggle for a member's phone/email, matching the design's
 * "Platform admin view — read only" masking pattern. Purely a display
 * concern: `admin_gym_members()` already returns real contact details (the
 * PII boundary reversal in 1009's header), so this masks what's already on
 * the page rather than gating a second fetch — no extra round trip, no new
 * RPC, just less exposed on screen by default.
 */
export function MemberContact({ phone, email }: { phone: string | null; email: string | null }) {
  const [shown, setShown] = useState(false);

  const maskedPhone = phone ? `${phone.slice(0, 6)}••• ••${phone.slice(-2)}` : "—";
  const maskedEmail = email ? `${email.slice(0, 2)}•••@${email.split("@")[1] ?? ""}` : "—";

  return (
    <span className="flex items-center gap-2">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="block truncate font-mono text-[11.5px]">{shown ? phone ?? "—" : maskedPhone}</span>
        <span className="block truncate text-[11px] text-mute">{shown ? email ?? "—" : maskedEmail}</span>
      </span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        title={shown ? "Hide contact details" : "Reveal contact details"}
        className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center border border-line text-mute"
      >
        {shown ? <HideIcon size={14} aria-hidden /> : <RevealIcon size={14} aria-hidden />}
      </button>
    </span>
  );
}
