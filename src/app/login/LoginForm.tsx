"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/features/auth/actions";
import { BrandLockup } from "@/core/brand/BrandLockup";
import { ButtonLabel } from "@/components/ButtonLabel";
import { SignInIcon } from "@/core/ui/icons";

const initialState: SignInState = { error: null };

/** Adapted from FitDeskApp/src/app/login/LoginForm.tsx — dropped the
 * username/authError handling (see actions.ts docblock: not applicable to
 * platform admins), copy changed to the operator-console context. */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col overflow-hidden border-[1.5px] border-ink bg-paper">
        <div className="flex flex-col gap-4 bg-ink px-6 py-8 text-paper">
          <BrandLockup />
          <h1 className="font-display text-[26px] leading-[1.05] tracking-[-0.03em]">
            Platform admin
          </h1>
          <p className="max-w-[260px] text-[12.5px] leading-relaxed text-mute3">
            Sign in with your platform admin account to reach the back office.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4 p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-mute">
              Email
            </span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@myfitdesk.app"
              key={state.email ?? ""}
              defaultValue={state.email ?? ""}
              required
              className="w-full border-[1.5px] border-ink bg-paper px-3 py-3 text-sm text-ink outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-mute">
              Password
            </span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className="w-full border-[1.5px] border-ink bg-paper px-3 py-3 text-sm text-ink outline-none"
            />
          </label>

          {state.error ? (
            <p className="border-[1.5px] border-accent bg-accent/8 px-3 py-2 text-[12px] font-medium text-accent">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 flex w-full items-center justify-center bg-ink py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] text-hi transition hover:bg-hi hover:text-ink active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
          >
            <ButtonLabel icon={SignInIcon} pending={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </ButtonLabel>
          </button>
        </form>
      </div>
    </div>
  );
}
