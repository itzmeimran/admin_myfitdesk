"use client";

import { ConfirmedForm } from '@/components/ConfirmedForm';
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { addGymNote, type AddGymNoteState } from "@/features/gyms/overview-actions";
import { AddIcon } from '@/core/ui/icons';

const INITIAL: AddGymNoteState = { error: null };

export function AdminNotesForm({ organizationId }: { organizationId: string }) {
  const [state, action] = useActionState(addGymNote, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <ConfirmedForm confirmation="Add this private note to the gym history?" ref={formRef} action={action} className="flex flex-col gap-2.5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_auto]">
        <input
          name="category"
          maxLength={60}
          placeholder="Category (optional)"
          className="min-h-[38px] border-[1.5px] border-line bg-paper px-3 text-[12px] outline-none focus:border-ink"
        />
        <input
          name="content"
          required
          maxLength={2000}
          placeholder="Add a private note for platform admins…"
          className="min-h-[38px] border-[1.5px] border-line bg-paper px-3 text-[12px] outline-none focus:border-ink"
        />
        <SubmitButton icon={AddIcon} variant="primary" size="sm"
          pendingLabel="Adding…"
        >
          Add note
        </SubmitButton>
      </div>
      {state.error ? <p role="alert" className="text-[11.5px] text-accent">{state.error}</p> : null}
    </ConfirmedForm>
  );
}
