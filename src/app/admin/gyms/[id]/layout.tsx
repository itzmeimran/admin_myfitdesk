import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { listAssignablePackages } from "@/features/gyms/queries";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { BackIcon, AlertIcon } from "@/core/ui/icons";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { GymDetailActions } from "./gym-detail-actions";
import { GymDetailTabs } from "./gym-detail-tabs";

/**
 * Platform Admin → Gyms → [Gym Name]. Shared shell for every
 * `/admin/gyms/[id]/*` tab: fetches the gym once via `admin_gym_detail()`
 * for the header, then renders the tab nav and lets each tab route fetch
 * its own (paginated) data independently. A bad or deleted organization id
 * 404s here rather than each tab separately handling a null gym.
 *
 * Header restyled to match the Claude Design "MyFitDesk Gym Detail" canvas:
 * a square initials mark, name + status pill, a one-line location/enrolled/
 * record-id meta row, and a deletion-request banner when
 * `deletion_requested_at` is set (real column, already on `GymDetail` —
 * no new query needed).
 */
export default async function GymDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [gym, packages] = await Promise.all([getGymDetail(supabase, id), listAssignablePackages(supabase)]);

  if (!gym) notFound();

  const location = [gym.city, gym.state, gym.country].filter(Boolean).join(", ") || "—";
  const initials = gym.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const enrolledSince = new Date(gym.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const billingLabel = capitalizeBillingPeriod(gym.subscription?.billingPeriod);

  return (
    <div className="flex flex-col gap-3.5">
      <Link href="/admin/gyms" className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute hover:text-ink">
        <BackIcon size={13} aria-hidden />
        All gyms
      </Link>

      {gym.deletionRequestedAt ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-[1.5px] border-accent bg-accent/8 p-3.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center border-[1.5px] border-accent text-accent"
          >
            <AlertIcon size={16} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] font-bold text-accent">
              Owner requested account deletion —{" "}
              {new Date(gym.deletionRequestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
            <span className="text-[12px] leading-relaxed text-ink2">
              {gym.owner ? `Requested by ${gym.owner.name}. ` : ""}
              This app has no automated deletion pipeline yet — nothing happens until an admin acts manually.
            </span>
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-[1.5px] border-ink bg-paper p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center bg-ink font-display text-[16px] tracking-[-0.02em] text-hi md:h-14 md:w-14 md:text-[19px]"
          >
            {initials || "—"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[22px] tracking-[-0.02em] md:text-[25px]">{gym.name}</h1>
              <span className={PILL_CLASS} style={pillTone(gym.status)}>
                {gym.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
              <span>{location}</span>
              <span>Enrolled since {enrolledSince}</span>
              <span className="font-mono text-[11px] text-mute3">gym_{gym.id.slice(0, 8)}</span>
            </div>
            <p className="text-[12px] text-mute">
              <span className="font-bold text-ink">
                {gym.subscription?.packageName ?? (gym.status === "Trialing" ? "Trial (no package)" : "No package")}
              </span>{" "}
              · {billingLabel}
              {gym.owner ? (
                <>
                  {" · "}
                  {gym.owner.name} ({gym.owner.email})
                </>
              ) : null}
            </p>
          </div>
          <GymDetailActions gym={gym} packages={packages} />
        </div>
      </div>

      <GymDetailTabs
        organizationId={gym.id}
        memberCount={gym.usage.memberCount}
        branchCount={gym.usage.branchCount}
        staffCount={gym.usage.staffCount}
      />

      {children}
    </div>
  );
}
