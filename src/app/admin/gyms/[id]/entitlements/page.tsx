import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { FEATURE_CHIPS } from "@/features/packages/mock-data";
import { UsageBar } from "@/components/UsageBar";
import { ConfirmIcon, CancelIcon } from "@/core/ui/icons";

/**
 * Entitlements tab (task brief §8). This is the one section where the
 * literal ask ("Plan Allows vs Gym Access", "tenant override if the
 * architecture supports it") doesn't map onto real stored data, so this
 * shows exactly what the schema actually has rather than fabricating a
 * per-plan feature matrix:
 *
 *  - `platform_packages.features` (text[]) is the one real per-package
 *    feature column, but nothing in this app has ever populated it (every
 *    create/update call sends `[]` — see features/packages/actions.ts) —
 *    so every plan's "shipped features" are the fixed baseline in
 *    FEATURE_CHIPS (every package/actions.ts call site's own comment: caps
 *    are what differ between tiers, not features). Shown as "included in
 *    every plan" rather than faking a per-tier ✓/✕ grid the data can't
 *    support.
 *  - The real per-plan differentiator is capacity (max_branches/members/
 *    staff), which the Overview tab already shows as usage bars — repeated
 *    here framed as entitlements ("Plan allows" vs "Gym is using") since
 *    that's the genuine Plan-Allows/Gym-Access relationship this schema
 *    has.
 *  - There is no tenant-level override table anywhere in this schema, so
 *    "Gym Access" is always identical to "Plan Allows" — stated plainly
 *    rather than rendering a second, always-identical column that implies
 *    an override capability that doesn't exist.
 */
export default async function GymEntitlementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const gym = await getGymDetail(supabase, id);
  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Included in every plan</h2>
        <p className="text-[11.5px] leading-relaxed text-mute">
          platform_packages.features exists as a column but has never been populated by any package write — every
          tier ships with the same fixed baseline capability set below. Caps (right) are what actually differ between
          tiers.
        </p>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {FEATURE_CHIPS.map((label) => (
            <div key={label} className="flex items-center gap-2 py-1 text-[12.5px]">
              <ConfirmIcon size={14} className="flex-shrink-0 text-ink" aria-hidden />
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Capacity entitlements</h2>
        <p className="text-[11.5px] leading-relaxed text-mute">
          The real per-plan differentiator. There is no tenant-level override mechanism in this schema — this gym&apos;s
          access always exactly matches its plan&apos;s caps, never more or less.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageBar label="Branches" used={gym.usage.branchCount} cap={gym.usage.branchCap} />
          <UsageBar label="Members" used={gym.usage.memberCount} cap={gym.usage.memberCap} />
          <UsageBar label="Staff logins" used={gym.usage.staffCount} cap={gym.usage.staffCap} />
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-3 text-[11px] text-mute3">
          <CancelIcon size={12} aria-hidden />
          No per-gym feature or cap overrides exist today — adding one would need a new
          `organization_feature_overrides`-style table, not just a UI change.
        </div>
      </section>
    </div>
  );
}
