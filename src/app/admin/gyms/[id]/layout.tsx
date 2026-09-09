import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { listAssignablePackages } from "@/features/gyms/queries";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { BackIcon } from "@/core/ui/icons";
import { GymDetailActions } from "./gym-detail-actions";
import { GymDetailTabs } from "./gym-detail-tabs";

/**
 * Platform Admin → Gyms → [Gym Name] (task brief §2). Shared shell for
 * every `/admin/gyms/[id]/*` tab: fetches the gym once via
 * `admin_gym_detail()` for the header, then renders the tab nav and lets
 * each tab route fetch its own (paginated) data independently. A bad or
 * deleted organization id 404s here rather than each tab separately
 * handling a null gym.
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

  const location = [gym.city, gym.state].filter(Boolean).join(", ") || "—";
  const sub = gym.subscription;
  const planLabel = sub?.packageName ?? (gym.status === "Trialing" ? "Trial (no package)" : "No package");
  const billingLabel = sub?.billingPeriod ? (sub.billingPeriod === "yearly" ? "Yearly" : "Monthly") : "—";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/gyms" className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute hover:text-ink">
        <BackIcon size={13} aria-hidden />
        All gyms
      </Link>

      <div className="flex flex-col gap-3 border-[1.5px] border-ink bg-paper p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-[22px] tracking-[-0.02em] md:text-[25px]">{gym.name}</h1>
              <span className={PILL_CLASS} style={pillTone(gym.status)}>
                {gym.status}
              </span>
            </div>
            <p className="text-[12.5px] text-mute">
              {gym.owner ? (
                <>
                  {gym.owner.name} · {gym.owner.email}
                </>
              ) : (
                "No owner on record"
              )}
              {" · "}
              {location}
            </p>
            <p className="text-[12px] text-mute">
              <span className="font-bold text-ink">{planLabel}</span> · {billingLabel}
              {gym.suspendedAt ? (
                <span className="text-accent"> · Suspended {new Date(gym.suspendedAt).toLocaleDateString("en-IN")}</span>
              ) : null}
            </p>
          </div>
          <GymDetailActions gym={gym} packages={packages} />
        </div>
      </div>

      <GymDetailTabs organizationId={gym.id} />

      {children}
    </div>
  );
}
