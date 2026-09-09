"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { GymDetail } from "@/features/gyms/detail";
import { updateGymProfile, type ProfileFormState } from "@/features/gyms/actions";
import { useToast } from "@/components/Toast";
import { ConfirmIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

const initialState: ProfileFormState = { error: null };

/** The Settings tab's "General" section, made real (task brief §10/§2's
 * "Edit gym" action) — `admin_update_organization_profile()`. Deliberately
 * excludes logo (no upload pipeline exists to validate a URL against) and
 * every secret-bearing table (payment/WhatsApp integrations) per the
 * brief's own "do NOT expose sensitive secrets" instruction. */
export function GymProfileForm({ gym }: { gym: GymDetail }) {
  const toast = useToast();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(updateGymProfile, initialState);

  // Same "adjust state during render, not in an effect" pattern
  // packages-view.tsx's PackageSheet already uses — useActionState re-runs
  // this component with a new `state` object on every submit, so comparing
  // by reference here fires exactly once per completed action.
  const [lastHandled, setLastHandled] = useState(initialState);
  if (state !== lastHandled) {
    setLastHandled(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state.success) {
      toast.success("Gym profile updated.");
      router.refresh();
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="organizationId" value={gym.id} />
      <div className="flex flex-wrap gap-3">
        <Field label="Gym name" name="name" defaultValue={gym.name} required basis={260} />
        <Field label="City" name="city" defaultValue={gym.city ?? ""} basis={180} />
        <Field label="State" name="state" defaultValue={gym.state ?? ""} basis={180} />
        <Field label="Country" name="country" defaultValue={gym.country ?? ""} basis={160} />
        <Field label="Postal code" name="postalCode" defaultValue={gym.postalCode ?? ""} basis={140} />
        <Field label="Address" name="addressLine" defaultValue={gym.addressLine ?? ""} basis="100%" />
        <Field label="Contact email" name="contactEmail" type="email" defaultValue={gym.contactEmail ?? ""} basis={240} />
        <Field label="Contact phone" name="contactPhone" defaultValue={gym.contactPhone ?? ""} basis={180} />
        <Field label="Timezone" name="defaultTimezone" defaultValue={gym.defaultTimezone} basis={200} />
        <Field label="Currency" name="defaultCurrency" defaultValue={gym.defaultCurrency} basis={120} />
        <Field
          label="Grace period (days)"
          name="gracePeriodDays"
          type="number"
          defaultValue={String(gym.gracePeriodDays)}
          basis={160}
          min={0}
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="press-scale flex min-h-[42px] items-center justify-center gap-2 self-start bg-hi px-5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
      >
        <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  basis,
  type = "text",
  required,
  min,
}: {
  label: string;
  name: string;
  defaultValue: string;
  basis: number | string;
  type?: string;
  required?: boolean;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1" style={{ flexBasis: basis, flexGrow: basis === "100%" ? 1 : 0 }}>
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        min={min}
        className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}
