"use client";

import { useActionState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmIcon } from "@/core/ui/icons";
import { ButtonLabel } from "@/components/ButtonLabel";
import { PRIMARY_BUTTON_CLASS } from "./ui";

type BaseState = { error: string | null; nonce: number; saved?: number | boolean | null };

/**
 * The shared save form for Settings sections: wires a Server Action to the
 * fields, blocks double submits (the button and every field are disabled while
 * the request is in flight), and reports the outcome through the existing toast
 * system. `nonce` makes each result distinct so the same message twice still
 * toasts twice.
 *
 * Fields inside are CONTROLLED by their owning component, not uncontrolled:
 * React 19 resets uncontrolled fields to their defaultValue after a form action
 * finishes, which would visibly snap a just-saved value back.
 */
export function SettingsForm<S extends BaseState>({
  action,
  initialState,
  children,
  submitLabel = "Save changes",
  disabled = false,
  disabledReason,
  footerExtra,
}: {
  action: (prev: S, formData: FormData) => Promise<S>;
  initialState: S;
  children: React.ReactNode;
  submitLabel?: string;
  /** View-only: the viewer can read this section but not change it. */
  disabled?: boolean;
  disabledReason?: string;
  footerExtra?: React.ReactNode;
}) {
  // Generic over the caller's state type for type-safe call sites; internally
  // only the BaseState fields are read, so widen it for useActionState.
  const [state, formAction, pending] = useActionState(
    action as unknown as (prev: BaseState, formData: FormData) => Promise<BaseState>,
    initialState as BaseState,
  );
  const toast = useToast();
  const handled = useRef(0);

  useEffect(() => {
    if (!state.nonce || state.nonce === handled.current) return;
    handled.current = state.nonce;
    if (state.error) toast.error(state.error);
    else if (state.saved === 0) toast.success("Nothing changed — no update needed.");
    else toast.success("Settings saved.");
  }, [state, toast]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={pending || disabled} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        {children}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
        {disabled ? (
          <p className="text-[11.5px] text-mute">{disabledReason ?? "You can view this, but only a Platform Owner can change it."}</p>
        ) : (
          <button type="submit" disabled={pending} className={PRIMARY_BUTTON_CLASS}>
            <ButtonLabel icon={ConfirmIcon} pending={pending}>
              {pending ? "Saving…" : submitLabel}
            </ButtonLabel>
          </button>
        )}
        {footerExtra}
      </div>
    </form>
  );
}
