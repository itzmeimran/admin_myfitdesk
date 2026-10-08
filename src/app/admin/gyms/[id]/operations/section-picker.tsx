"use client";

import type { ReactNode } from "react";
import { Dropdown } from "@/components/Dropdown";
import { useNavigationPending } from "@/components/NavigationPending";

export type SectionOption = { key: string; label: string };

/**
 * Operations section switcher: one dropdown instead of twelve buttons in a
 * row. The section is still URL state (`?section=`), so every section keeps a
 * shareable link and the back button. Going through the shared navigation
 * transition lights the top progress bar the instant a section is picked, and
 * the dropdown shows the section being loaded rather than snapping back to the
 * old one while the server responds.
 */
export function SectionPicker({
  base,
  current,
  sections,
}: {
  base: string;
  current: string;
  sections: readonly SectionOption[];
}) {
  const { pendingHref, navigate } = useNavigationPending();
  const target = pendingHref ? new URLSearchParams(pendingHref.split("?")[1] ?? "").get("section") : null;
  const shown = sections.some((s) => s.key === target) ? (target as string) : current;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute">Section</span>
      <div className="w-full sm:w-[280px]">
        <Dropdown
          ariaLabel="Operations section"
          value={shown}
          options={sections.map((s) => ({ value: s.key, label: s.label }))}
          onChange={(next) => {
            if (next !== shown) navigate(`${base}?section=${next}`, { scroll: false });
          }}
        />
      </div>
    </div>
  );
}

/**
 * Wraps the section body: while a section change is in flight the old content
 * dims and stops taking clicks, so the page visibly reacts instead of sitting
 * still until the new section streams in.
 */
export function SectionBody({ children }: { children: ReactNode }) {
  const { pending } = useNavigationPending();
  return (
    <div
      aria-busy={pending || undefined}
      className={`transition-opacity duration-200 ${pending ? "pointer-events-none opacity-50" : ""}`}
    >
      {children}
    </div>
  );
}
