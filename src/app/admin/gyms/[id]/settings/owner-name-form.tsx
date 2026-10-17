"use client";

import { useActionState } from "react";
import { ConfirmedForm } from "@/components/ConfirmedForm";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmIcon } from "@/core/ui/icons";
import { updateGymOwnerName, type ProfileFormState } from "@/features/gyms/actions";

const initialState: ProfileFormState = { error: null };

export function OwnerNameForm({ organizationId, staffId, firstName, lastName }: {
  organizationId: string; staffId: string; firstName: string; lastName: string;
}) {
  const [state, action] = useActionState(updateGymOwnerName, initialState);
  return <ConfirmedForm action={action} confirmation="Save this owner's corrected name?" className="flex flex-col gap-3 border-t border-line pt-3">
    <input type="hidden" name="organizationId" value={organizationId} />
    <input type="hidden" name="staffId" value={staffId} />
    <div className="flex flex-wrap gap-3">
      <label className="flex min-w-0 flex-1 basis-52 flex-col gap-1">
        <span className="mfd-micro-label">Owner first name <span className="text-accent">*</span></span>
        <input name="firstName" defaultValue={firstName} required maxLength={100} autoComplete="given-name" className="border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent" />
      </label>
      <label className="flex min-w-0 flex-1 basis-52 flex-col gap-1">
        <span className="mfd-micro-label">Owner last name</span>
        <input name="lastName" defaultValue={lastName} maxLength={100} autoComplete="family-name" className="border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent" />
      </label>
    </div>
    {state.error ? <p role="alert" className="text-[12px] text-accent">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-[12px] text-ink">Owner name updated.</p> : null}
    <SubmitButton icon={ConfirmIcon} pendingLabel="Saving…" className="self-start">Save owner name</SubmitButton>
  </ConfirmedForm>;
}
