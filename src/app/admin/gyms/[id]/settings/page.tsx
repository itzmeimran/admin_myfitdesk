import { IST_TIME_ZONE } from "@/core/dates/ist";
import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymConfiguration } from "@/features/gyms/config";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { GymProfileForm } from "./gym-profile-form";
import { GymLogoUpload } from "./gym-logo-upload";
import { getOwnerAccount } from "@/features/gyms/owner-account";
import { hasPermission, requirePermission } from "@/core/auth/access";
import { OwnerNameForm } from "./owner-name-form";

/**
 * Settings tab (task brief §10) — General is a real, writable form
 * (admin_update_organization_profile); Account also edits the owner's name.
 * Configuration displays status only. No secrets are ever fetched or rendered here
 * (see features/gyms/config.ts's own docblock) — Configuration shows
 * connection status only, never a key, token, or webhook secret.
 */
export default async function GymSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("gyms.view");
  const { id } = await params;
  const supabase = await createClient();
  const [gym, config] = await Promise.all([getGymDetail(supabase, id), getGymConfiguration(supabase, id)]);
  if (!gym) notFound();
  const ownerAccount = gym.owner ? await getOwnerAccount(supabase, id, gym.owner.staffId) : null;

  // Read straight from organizations (platform admins have a SELECT policy on
  // it, 1002) rather than growing admin_gym_detail(). Any error — e.g. the
  // tenant's 0112 column not applied on this project — just hides the value.
  const { data: taglineRow } = await supabase.from("organizations").select("tagline").eq("id", id).maybeSingle();
  const tagline = taglineRow?.tagline ?? "";

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">General</h2>
        <GymLogoUpload organizationId={gym.id} gymName={gym.name} logoUrl={gym.logoUrl} />
        <GymProfileForm gym={gym} tagline={tagline} />
      </section>

      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Account</h2>
        <dl className="flex flex-col gap-2 text-[12.5px]">
          <Row k="Owner" v={gym.owner ? `${gym.owner.name} (${gym.owner.email || gym.owner.phone || "Phone login"})` : "No owner on record"} />
          <Row k="Account status">
            <span className={PILL_CLASS} style={pillTone(gym.status)}>
              {gym.status}
            </span>
          </Row>
          <Row k="Created" v={new Date(gym.createdAt).toLocaleDateString("en-IN", { timeZone: IST_TIME_ZONE, day: "numeric", month: "long", year: "numeric" })} />
          <Row k="Owner login email" v={ownerAccount ? (ownerAccount.email ? `${ownerAccount.email} · ${ownerAccount.email_verified ? "Verified" : "Verification not recorded"}` : "Email login not used") : "Verification unavailable"} />
          <Row k="Owner mobile" v={ownerAccount ? (ownerAccount.phone ? `${ownerAccount.phone} · ${ownerAccount.phone_verified ? "Verified" : ownerAccount.whatsapp_otp_available ? "WhatsApp OTP available" : "On file"}` : "No owner mobile on file") : "Verification unavailable"} />
        </dl>
        <p className="text-[11px] text-mute">Owner login verification is separate from the optional gym contact details. WhatsApp OTP uses its own verification flow.</p>
        {gym.owner && ownerAccount && hasPermission(access, "gyms.manage") ? <OwnerNameForm
          key={gym.owner.staffId} organizationId={gym.id} staffId={gym.owner.staffId}
          firstName={ownerAccount.first_name} lastName={ownerAccount.last_name ?? ""}
        /> : null}
      </section>

      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Configuration</h2>
        <dl className="flex flex-col gap-2 text-[12.5px]">
          <Row k="Payment gateway" v={config.payment ? config.payment.status : "Not connected"} />
          {config.payment?.lastError ? <Row k="Payment last error" v={config.payment.lastError} /> : null}
          <Row k="WhatsApp" v={config.whatsapp ? config.whatsapp.status : "Not connected"} />
          {config.whatsapp?.lastError ? <Row k="WhatsApp last error" v={config.whatsapp.lastError} /> : null}
          <Row
            k="Notifications"
            v={
              config.notifications
                ? `${config.notifications.defaultChannel} · digest ${config.notifications.weeklyDigestEnabled ? "on" : "off"} · renewal reminders ${config.notifications.renewalRemindersEnabled ? "on" : "off"}`
                : "Default configuration"
            }
          />
        </dl>
        <p className="border-t border-line pt-3 text-[11px] text-mute3">
          Connection status only — API keys, tokens and webhook secrets are never fetched or shown here.
        </p>
      </section>
    </div>
  );
}

function Row({ k, v, children }: { k: string; v?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <dt className="text-mute">{k}</dt>
      <dd className="min-w-0 break-words text-right font-bold text-ink">{children ?? v}</dd>
    </div>
  );
}
