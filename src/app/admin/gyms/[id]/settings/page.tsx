import { notFound } from "next/navigation";
import { createClient } from "@/core/db/server-client";
import { getGymDetail } from "@/features/gyms/detail";
import { getGymConfiguration } from "@/features/gyms/config";
import { pillTone, PILL_CLASS } from "@/core/ui/status-style";
import { GymProfileForm } from "./gym-profile-form";

/**
 * Settings tab (task brief §10) — General is a real, writable form
 * (admin_update_organization_profile); Account and Configuration are
 * read-only status displays. No secrets are ever fetched or rendered here
 * (see features/gyms/config.ts's own docblock) — Configuration shows
 * connection status only, never a key, token, or webhook secret.
 */
export default async function GymSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [gym, config] = await Promise.all([getGymDetail(supabase, id), getGymConfiguration(supabase, id)]);
  if (!gym) notFound();

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">General</h2>
        <GymProfileForm gym={gym} />
      </section>

      <section className="flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4">
        <h2 className="mfd-micro-label">Account</h2>
        <dl className="flex flex-col gap-2 text-[12.5px]">
          <Row k="Owner" v={gym.owner ? `${gym.owner.name} (${gym.owner.email})` : "No owner on record"} />
          <Row k="Account status">
            <span className={PILL_CLASS} style={pillTone(gym.status)}>
              {gym.status}
            </span>
          </Row>
          <Row k="Created" v={new Date(gym.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} />
          <Row k="Verification" v={gym.contactEmail ? "Contact email on file" : "No contact email on file"} />
        </dl>
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
      <dd className="text-right font-bold capitalize text-ink">{children ?? v}</dd>
    </div>
  );
}
