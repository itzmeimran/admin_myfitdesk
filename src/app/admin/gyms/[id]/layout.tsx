import { IST_TIME_ZONE } from "@/core/dates/ist";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { listAssignablePackages } from "@/features/gyms/queries";
import { getGymOwnerInvitation } from "@/features/gyms/onboarding";
import { BackIcon, AlertIcon } from "@/core/ui/icons";
import { GymHeader } from "./gym-header";
import { GymDetailTabs } from "./gym-detail-tabs";
import { OwnerInvitationCard } from "./owner-invitation-card";
import { GymRealtimeProvider } from "./gym-realtime-provider";
import { LiveIndicator } from "./live-indicator";

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
  const [gym, packages, ownerInvitation] = await Promise.all([
    getGymDetail(supabase, id),
    listAssignablePackages(supabase),
    getGymOwnerInvitation(supabase, id),
  ]);

  if (!gym) notFound();

  return (
    <GymRealtimeProvider key={gym.id} organizationId={gym.id}>
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/gyms" className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute hover:text-ink">
          <BackIcon size={13} aria-hidden />
          All gyms
        </Link>
        <LiveIndicator />
      </div>

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
              {new Date(gym.deletionRequestedAt).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "short" })}
            </span>
            <span className="text-[12px] leading-relaxed text-ink2">
              {gym.owner ? `Requested by ${gym.owner.name}. ` : ""}
              This app has no automated deletion pipeline yet — nothing happens until an admin acts manually.
            </span>
          </span>
        </div>
      ) : null}

      {ownerInvitation && ownerInvitation.effectiveStatus !== "active" ? (
        <OwnerInvitationCard invitation={ownerInvitation} />
      ) : null}

      <GymHeader gym={gym} packages={packages} invitation={ownerInvitation} />

      <div className="z-10 bg-paper md:sticky md:top-0">
        <GymDetailTabs
          organizationId={gym.id}
          memberCount={gym.usage.memberCount}
          branchCount={gym.usage.branchCount}
          staffCount={gym.usage.staffCount}
        />
      </div>

      {children}
    </div>
    </GymRealtimeProvider>
  );
}
