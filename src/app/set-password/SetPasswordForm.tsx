"use client";

import { useActionState, useState } from "react";
import { setInvitedPassword, type SetPasswordState } from "./actions";
import { BrandLockup } from "@/core/brand/BrandLockup";
import { ButtonLabel } from "@/components/ButtonLabel";
import { ConfirmIcon, HideIcon, RevealIcon } from "@/core/ui/icons";

const initialState: SetPasswordState = { error: null };
const FIELD = "w-full border-[1.5px] border-ink bg-paper px-3 py-3 pr-11 text-sm text-ink outline-none";
const LABEL = "text-[9px] font-bold uppercase tracking-[0.14em] text-mute";

export function SetPasswordForm({ environmentLabel, email }: { environmentLabel: string; email: string }) {
  const [state, formAction, pending] = useActionState(setInvitedPassword, initialState);
  const [show, setShow] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col overflow-hidden border-[1.5px] border-ink bg-paper">
        <div className="flex flex-col gap-4 bg-ink px-6 py-8 text-paper">
          <BrandLockup />
          <h1 className="font-display text-[24px] leading-[1.05] tracking-[-0.03em]">Choose your password</h1>
          <p className="text-[12.5px] leading-relaxed text-mute3">
            {email ? `${email} · ` : ""}
            {environmentLabel} environment. Only you will know this password.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4 p-6">
          {(["password", "confirm"] as const).map((name) => (
            <label key={name} className="flex flex-col gap-1.5">
              <span className={LABEL}>{name === "password" ? "New password" : "Confirm password"}</span>
              <span className="relative block">
                <input
                  name={name}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={10}
                  disabled={pending}
                  className={FIELD}
                />
                {name === "password" ? (
                  <button
                    type="button"
                    aria-label={show ? "Hide passwords" : "Show passwords"}
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-0 top-0 flex h-full w-11 items-center justify-center text-mute hover:text-ink"
                  >
                    {show ? <HideIcon size={16} aria-hidden /> : <RevealIcon size={16} aria-hidden />}
                  </button>
                ) : null}
              </span>
            </label>
          ))}
          <p className="text-[11px] text-mute3">At least 10 characters.</p>

          {state.error ? (
            <p role="alert" className="border-[1.5px] border-accent bg-accent/8 px-3 py-2 text-[12px] font-medium text-accent">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="press-scale mt-1 flex w-full items-center justify-center bg-ink py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] text-hi disabled:pointer-events-none disabled:opacity-60"
          >
            <ButtonLabel icon={ConfirmIcon} pending={pending}>
              {pending ? "Saving…" : "Set password & continue"}
            </ButtonLabel>
          </button>
        </form>
      </div>
    </div>
  );
}
