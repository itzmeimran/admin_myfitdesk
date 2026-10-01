import type { GymDetail } from "@/features/gyms/detail";
import type { AssignablePackage } from "@/features/gyms/queries";
import type { OwnerInvitation } from "@/features/gyms/onboarding-types";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { capitalizeBillingPeriod } from "@/core/text/billing-period";
import { formatZonedDate } from "@/core/dates/format";
import { formatMinorWhole } from "@/core/money/format";
import { ImageLightbox } from "@/components/ImageLightbox";
import { GymSubscriptionPanel } from "./gym-subscription-panel";
import { CopyButton } from "./copy-button";
import { buildSubscriptionPanelView } from "./subscription-view";

/**
 * The gym header card: identity and contact facts on the left, the
 * subscription panel (days left, meter, actions) on the right. Stacks to one
 * column below `lg`; the four facts sit in a 2x2 grid below `xl` and in one
 * divided row from `xl` up.
 */
export function GymHeader({
  gym,
  packages,
  invitation,
}: {
  gym: GymDetail;
  packages: AssignablePackage[];
  invitation: OwnerInvitation | null;
}) {
  const initials = gym.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const enrolledSince = formatZonedDate(gym.createdAt, gym.defaultTimezone);
  const sub = gym.subscription;
  const planName = sub?.packageName ?? (gym.status === "Trialing" ? "Trial" : "No package");
  const planDetail = sub?.packageName
    ? [capitalizeBillingPeriod(sub.billingPeriod), sub.priceMinor !== null ? formatMinorWhole(sub.priceMinor, sub.currency ?? "INR") : null]
    : [gym.status === "Trialing" ? "no package" : null];
  const view = buildSubscriptionPanelView(gym);

  const ownerPhone = gym.owner?.phone ?? gym.contactPhone;
  const ownerEmail = gym.owner?.email ?? gym.contactEmail;
  // Divider rules: a 2x2 grid with hairlines below xl, one row of columns from xl up.
  const FACT =
    "min-w-0 border-line px-4 py-2.5 border-b-[1.5px] odd:border-r-[1.5px] [&:nth-last-child(-n+2)]:border-b-0 " +
    "xl:border-b-0 xl:border-r-0 xl:border-l-[1.5px] xl:px-6 xl:py-0 xl:first:border-l-0 xl:first:pl-0 xl:odd:border-r-0";
  const FACT_LABEL = "mb-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-mute2";
  const FACT_VALUE = "flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-ink";

  return (
    <div className="grid border-[1.5px] border-ink bg-paper lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_352px]">
      <div className="flex min-w-0 flex-col justify-between gap-5 overflow-hidden p-4 md:p-6">
        <div className="flex items-center gap-3.5 md:gap-4">
          <span
            aria-hidden={gym.logoUrl ? undefined : "true"}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden bg-ink font-display text-[16px] tracking-[-0.02em] text-hi md:h-[60px] md:w-[60px] md:text-[20px]"
          >
            {gym.logoUrl ? (
              <ImageLightbox src={gym.logoUrl} alt={`${gym.name} logo`} title={gym.name} subtitle="Gym logo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gym.logoUrl} alt={`${gym.name} logo`} className="h-full w-full bg-paper object-contain" />
              </ImageLightbox>
            ) : (
              initials || "—"
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="font-display text-[20px] leading-[1.1] tracking-[-0.02em] md:text-[26px]">{gym.name}</h1>
              <span className={PILL_CLASS} style={pillTone(gym.status)}>
                {gym.status}
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-mute">
              <span className="font-bold text-ink">{planName}</span>
              {planDetail.filter(Boolean).map((part) => (
                <span key={part}> · {part}</span>
              ))}
              <span> · Joined {enrolledSince}</span>
            </p>
          </div>
        </div>

        <dl className="-mx-4 -mb-4 grid grid-cols-2 border-t-[1.5px] border-line md:-mx-6 md:-mb-6 xl:mx-0 xl:mb-0 xl:flex xl:pt-3.5">
          <div className={FACT}>
            <dt className={FACT_LABEL}>Owner</dt>
            <dd className={FACT_VALUE}>
              <span className="truncate">{gym.owner?.name ?? "Not assigned"}</span>
            </dd>
          </div>
          <div className={FACT}>
            <dt className={FACT_LABEL}>Phone</dt>
            {ownerPhone ? (
              <dd className={FACT_VALUE}>
                <span className="truncate">{ownerPhone}</span>
                <CopyButton value={ownerPhone} label="Phone" />
              </dd>
            ) : (
              <dd className={`${FACT_VALUE} text-mute3`}>Not provided</dd>
            )}
          </div>
          <div className={FACT}>
            <dt className={FACT_LABEL}>Email</dt>
            {ownerEmail ? (
              <dd className={FACT_VALUE}>
                <span className="truncate" title={ownerEmail}>
                  {ownerEmail}
                </span>
                <CopyButton value={ownerEmail} label="Email" />
              </dd>
            ) : (
              <dd className={`${FACT_VALUE} text-mute3`}>Not provided</dd>
            )}
          </div>
          <div className={FACT}>
            <dt className={FACT_LABEL}>Gym ID</dt>
            <dd className={FACT_VALUE}>
              <span className="font-mono text-[12.5px] tracking-[0.02em]">{gym.gymCode}</span>
              <CopyButton value={gym.gymCode} label="Gym ID" />
            </dd>
          </div>
        </dl>
      </div>

      <GymSubscriptionPanel gym={gym} packages={packages} invitation={invitation} view={view} />
    </div>
  );
}
