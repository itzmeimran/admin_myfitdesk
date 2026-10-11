"use client";

import { ConfirmedForm } from "@/components/ConfirmedForm";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { addGymNote, type AddGymNoteState } from "@/features/gyms/overview-actions";
import { AddIcon } from "@/core/ui/icons";

const INITIAL: AddGymNoteState = { error: null };
const LIMIT = 2000;

/** `categories` are the ones already used on this gym's notes (none are predefined). */
export function AdminNotesForm({ organizationId, categories }: { organizationId: string; categories: string[] }) {
  const [state, action] = useActionState(addGymNote, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [length, setLength] = useState(0);
  const listId = useId();
  const contentId = useId();

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the counter together with the form reset
      setLength(0);
    }
  }, [state.success]);

  return (
    <ConfirmedForm confirmation="Add this private note to the gym history?" ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label htmlFor={contentId} className="sr-only">
        Private note
      </label>
      <textarea
        id={contentId}
        name="content"
        required
        rows={3}
        maxLength={LIMIT}
        onChange={(event) => setLength(event.target.value.length)}
        placeholder="Add a private note for platform admins…"
        className="w-full resize-y border-[1.5px] border-line bg-paper px-3 py-2 text-[13px] leading-relaxed outline-none placeholder:text-mute focus:border-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="category"
          list={listId}
          maxLength={60}
          aria-label="Category (optional)"
          placeholder="Category (optional)"
          className="min-h-[36px] min-w-0 flex-1 basis-40 border-[1.5px] border-line bg-paper px-3 text-[12.5px] outline-none placeholder:text-mute focus:border-ink"
        />
        <datalist id={listId}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <span className="text-[11px] tabular-nums text-mute" aria-live="off">
          {length.toLocaleString("en-IN")} / {LIMIT.toLocaleString("en-IN")}
        </span>
        <SubmitButton icon={AddIcon} variant="primary" size="sm" pendingLabel="Saving…">
          Save note
        </SubmitButton>
      </div>
      {state.error ? (
        <p role="alert" className="text-[12px] font-bold text-accent">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-[12px] text-ink2">
          Note saved.
        </p>
      ) : null}
    </ConfirmedForm>
  );
}
