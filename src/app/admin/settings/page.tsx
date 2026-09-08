import Link from "next/link";
import { BackIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/**
 * Explicitly a placeholder per the design's own Settings section
 * (design-audit.md: "Out of scope for this handoff — the four screens in
 * the rail are the deliverable."). No table, no form, no mock-data module —
 * there is nothing here to swap for a real query yet.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="flex max-w-md flex-col items-center gap-4 border-[1.5px] border-line bg-paper p-8 text-center">
        <h1 className="font-display text-[18px] tracking-[-0.015em]">Platform settings</h1>
        <p className="text-[13px] leading-relaxed text-mute">
          Grace-period default, invoice prefix, webhook endpoints and admin accounts live here.
          Out of scope for this handoff — the four screens in the rail are the deliverable.
        </p>
        <Link
          href="/admin"
          className="press-scale flex min-h-[40px] items-center gap-2 border-[1.5px] border-ink bg-paper px-4 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
        >
          <BackIcon size={ICON_SIZE.button} aria-hidden />
          Back to overview
        </Link>
      </div>
    </div>
  );
}
