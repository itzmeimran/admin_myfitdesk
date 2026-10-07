"use client";

import { ConfirmedForm } from '@/components/ConfirmedForm';
import { Button } from "@/components/Button";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { SubmitButton } from "@/components/SubmitButton";
import { useToast } from "@/components/Toast";
import { inviteGymOwner, type InviteFormState } from "./invite-actions";
import type { AssignablePackage } from "@/features/gyms/queries";
import { InviteIcon } from "@/core/ui/icons";
import { Dropdown } from "@/components/Dropdown";
import { ConfirmIcon } from '@/core/ui/icons';

const INITIAL_STATE: InviteFormState = { error: null };

const FIELD =
  "w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink";
const LABEL = "text-[9px] font-bold uppercase tracking-[0.12em] text-mute";

/** `defaults` come from Settings -> Platform defaults (read server-side by the
 * page); they only pre-fill the form, and the submit action re-applies them
 * server-side when a field is left blank. */
export function InviteGymOwnerSheet({
  packages,
  defaults,
}: {
  packages: AssignablePackage[];
  defaults: { trialDays: number; country: string };
}) {
  const [open, setOpen] = useState(false);
  const [billingMode, setBillingMode] = useState<"trial" | "paid" | "custom">("trial");
  const [invitationMethod, setInvitationMethod] = useState<"email" | "whatsapp">("email");
  const [packageId, setPackageId] = useState("");
  const [state, formAction] = useActionState(inviteGymOwner, INITIAL_STATE);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error, toast]);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <>
      <Button icon={InviteIcon}
        type="button"
        onClick={() => setOpen(true)}
        variant="primary" size="sm"
      >
        Onboard gym
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Creates a gym + sends an owner invitation"
        title="Onboard a gym"
        maxHeightClassName="max-h-[92%]"
      >
        {state.success ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-bold text-ink">
              Gym created — record id <span className="font-mono">{state.success.gymCode}</span>.
            </p>
            {state.success.manualLink ? (
              <p className="border-[1.5px] border-accent bg-accent/8 p-3 text-[12px] leading-relaxed text-ink2">
                {state.success.manualLink}
              </p>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-mute">
                {state.success.invitationMethod === "whatsapp"
                  ? "A WhatsApp OTP has been sent. The owner can enter it using Continue with WhatsApp in the app to join the gym. Future logins use their phone and an OTP, with no password."
                  : "An invitation email has been sent. You can track its status from the gym's own page."}
              </p>
            )}
            <Button icon={ConfirmIcon}
              type="button"
              onClick={() => setOpen(false)}
              variant="primary" size="md"
            >
              Done
            </Button>
          </div>
        ) : (
          <ConfirmedForm confirmation={invitationMethod === "whatsapp" ? "Create this gym and send the owner a WhatsApp OTP? Owner access starts after verification." : "Create this gym account and send the owner an email invitation?"} action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="invitationMethod" value={invitationMethod} />
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className={LABEL}>Gym details</span>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Gym name *</span>
                <input name="gymName" required className={FIELD} placeholder="e.g. Iron Yard Fitness" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Gym logo (optional, PNG/JPEG/WebP, up to 5MB)</span>
                <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-[12px]" />
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className={LABEL}>Owner details</span>
              <div className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Invite using</span>
                <Dropdown value={invitationMethod} onChange={value => setInvitationMethod(value as "email" | "whatsapp")}
                  ariaLabel="Invitation method" options={[{ value: "email", label: "Email invitation" }, { value: "whatsapp", label: "Phone · WhatsApp OTP" }]} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">First name *</span>
                  <input name="ownerFirstName" required className={FIELD} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">Last name</span>
                  <input name="ownerLastName" className={FIELD} />
                </label>
              </div>
              {invitationMethod === "email" ? <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Email address *</span>
                <input name="email" type="email" required className={FIELD} placeholder="owner@example.com" />
              </label> : null}
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">{invitationMethod === "whatsapp" ? "WhatsApp mobile number *" : "Phone (optional)"}</span>
                <input name="phone" type="tel" autoComplete="tel" required={invitationMethod === "whatsapp"} placeholder="98765 43210 or +91 98765 43210" className={FIELD} />
              </label>
              {invitationMethod === "whatsapp" ? <p className="text-[12px] leading-relaxed text-mute">
                No email or password needed. The owner receives a WhatsApp OTP and verifies it in the app to join. They can request a fresh code from Continue with WhatsApp whenever they sign in.
              </p> : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className={LABEL}>Gym address (optional)</span>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Address line</span>
                <input name="addressLine" className={FIELD} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">City</span>
                  <input name="city" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">State</span>
                  <input name="state" className={FIELD} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">Country</span>
                  <input name="country" defaultValue={defaults.country} className={FIELD} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">Postal code</span>
                  <input name="postalCode" className={FIELD} />
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className={LABEL}>Access</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Billing mode">
                {(["trial", "paid", "custom"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={`flex min-h-[36px] flex-1 cursor-pointer items-center justify-center border-[1.5px] px-2.5 text-[11px] font-bold uppercase tracking-[0.06em] ${
                      billingMode === mode ? "border-ink bg-ink text-hi" : "border-line text-ink"
                    }`}
                  >
                    <input
                      type="radio"
                      name="billingMode"
                      value={mode}
                      checked={billingMode === mode}
                      onChange={() => setBillingMode(mode)}
                      className="sr-only"
                    />
                    {mode === "trial" ? "Free trial" : mode === "paid" ? "Paid subscription" : "Custom access"}
                  </label>
                ))}
              </div>

              {billingMode === "trial" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">Trial length (days)</span>
                  <input name="trialDays" type="number" min="1" defaultValue={String(defaults.trialDays)} className={FIELD} />
                </label>
              ) : null}

              {billingMode === "paid" ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] text-mute">Subscription plan *</span>
                    <input type="hidden" name="packageId" value={packageId} />
                    <Dropdown value={packageId} onChange={setPackageId} ariaLabel="Subscription plan"
                      options={[{ value: "", label: "Select a plan" }, ...packages.map(p => ({ value: p.id, label: `${p.name} · ${p.price}` }))]} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] text-mute">Period length override (days, optional — defaults to the plan&apos;s own cycle)</span>
                    <input name="periodDays" type="number" min="1" className={FIELD} />
                  </label>
                </>
              ) : null}

              {billingMode === "custom" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-[10.5px] text-mute">Days of access to grant *</span>
                  <input name="customDays" type="number" min="1" required className={FIELD} />
                </label>
              ) : null}

              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-mute">Notes (optional, kept in the audit log)</span>
                <textarea name="notes" rows={2} className={`${FIELD} resize-none`} />
              </label>
            </div>

            <SubmitButton icon={InviteIcon} variant="primary" size="lg"
              pendingLabel="Creating gym…"
            >
              {invitationMethod === "whatsapp" ? "Create gym & send OTP" : "Create gym & send invitation"}
            </SubmitButton>
          </ConfirmedForm>
        )}
      </Sheet>
    </>
  );
}
