"use client";

import { Button } from "@/components/Button";
import { useActionState, useEffect, useRef, useState } from "react";
import { invitePlatformAdmin, type InviteState } from "../_server/invite-actions";
import type { PlatformRole } from "@/features/settings/admins";
import type { AdminEnvironment } from "@/core/config/environments";
import { ADMIN_ENVIRONMENT_LABEL } from "@/core/config/environments";
import { Dropdown } from "@/components/Dropdown";
import { useToast } from "@/components/Toast";
import { InviteIcon } from "@/core/ui/icons";
import { Field, INPUT_CLASS, HINT_CLASS, Notice } from "../_components/ui";

type Scope = "dev" | "prod" | "both";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "dev", label: "Development" },
  { value: "prod", label: "Production" },
  { value: "both", label: "Both" },
];

const INITIAL: InviteState = { error: null, results: [], nonce: 0 };

export function InviteAdminForm({
  roles,
  currentEnvironment,
  canManage,
}: {
  roles: PlatformRole[];
  currentEnvironment: AdminEnvironment;
  canManage: boolean;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(invitePlatformAdmin, INITIAL);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support_admin");
  const [scope, setScope] = useState<Scope>(currentEnvironment);
  const [confirmation, setConfirmation] = useState("");
  const handled = useRef(0);

  // Clear the form once a submission fully succeeded. Done while rendering
  // (React's recommended "adjust state on a prop change" pattern) rather than in
  // an Effect, which would cascade an extra render.
  const [clearedFor, setClearedFor] = useState(0);
  if (state.nonce && state.nonce !== clearedFor) {
    setClearedFor(state.nonce);
    if (!state.error && state.results.length > 0 && state.results.every((r) => r.ok)) {
      setEmail("");
      setConfirmation("");
    }
  }

  const includesProd = scope === "prod" || scope === "both";
  const needsConfirmation = includesProd || currentEnvironment === "prod";
  const roleInfo = roles.find((r) => r.role === role);
  const environments: AdminEnvironment[] = scope === "both" ? ["dev", "prod"] : [scope];

  useEffect(() => {
    if (!state.nonce || state.nonce === handled.current) return;
    handled.current = state.nonce;
    if (state.error) {
      toast.error(state.error);
      return;
    }
    const failed = state.results.filter((r) => !r.ok);
    if (failed.length === 0) {
      toast.success("Invitation sent.");
    } else if (failed.length < state.results.length) {
      toast.error("Invited on one environment, but not the other — see details below.");
    } else {
      toast.error(failed[0].message);
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={pending || !canManage} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Email" required hint="If they don't have an account yet, one is created and they choose their own password.">
            <input
              name="email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@myfitdesk.app"
              className={INPUT_CLASS}
            />
          </Field>

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Role<span className="text-accent"> *</span>
            </span>
            <Dropdown
              value={role}
              onChange={setRole}
              ariaLabel="Role"
              options={roles.map((r) => ({ value: r.role, label: r.label }))}
              className="w-full"
              disabled={pending || !canManage}
            />
            <input type="hidden" name="role" value={role} />
            {roleInfo ? <span className={HINT_CLASS}>{roleInfo.description}</span> : null}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Environment access</span>
          <div className="flex gap-2" role="radiogroup" aria-label="Environment access">
            {SCOPE_OPTIONS.map((option) => {
              const active = scope === option.value;
              const prodish = option.value !== "dev";
              return (
                <label
                  key={option.value}
                  className={`press-scale flex min-h-[40px] flex-1 cursor-pointer items-center justify-center border-[1.5px] px-2 text-center text-[11px] font-bold uppercase tracking-[0.06em] ${
                    active ? (prodish ? "border-accent bg-accent text-paper" : "border-ink bg-ink text-hi") : "border-line text-ink hover:border-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={active}
                    onChange={() => setScope(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          {environments.map((env) => (
            <input key={env} type="hidden" name="environments" value={env} />
          ))}
          <span className={HINT_CLASS}>
            Each environment is a separate database, so access is granted in each one separately
            {scope === "both" ? " — they'll get one invitation email per environment." : "."}
          </span>
        </div>

        {needsConfirmation ? (
          <div className="flex flex-col gap-2">
            {includesProd ? (
              <Notice tone="warning">
                This grants access to <strong>live production data</strong> (real gyms, members and payments).
              </Notice>
            ) : null}
            <Field label={`Type PRODUCTION to confirm`} required>
              <input
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                placeholder="PRODUCTION"
                className={`${INPUT_CLASS} border-accent font-bold`}
              />
            </Field>
          </div>
        ) : null}
      </fieldset>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={InviteIcon} pending={pending}
            type="submit"
            disabled={pending || (needsConfirmation && confirmation.trim().toUpperCase() !== "PRODUCTION")}
            variant="primary" size="md"
          >
              {pending ? "Sending…" : "Send invitation"}
          </Button>
          <span className={HINT_CLASS}>Invitations expire after 7 days and can be resent.</span>
        </div>
      ) : (
        <p className="text-[11.5px] text-mute">Only a Platform Owner can invite admins.</p>
      )}

      {state.results.length ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {state.results.map((result) => (
            <li
              key={result.environment}
              className={`flex flex-col gap-2 border-[1.5px] p-3 text-[12px] ${result.ok ? "border-line bg-sand" : "border-accent bg-accent/8"}`}
            >
              <span className={result.ok ? "text-ink" : "text-accent"}>
                <strong>{ADMIN_ENVIRONMENT_LABEL[result.environment]}:</strong> {result.message}
              </span>
              {result.manualLink ? <ManualLink link={result.manualLink} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

function ManualLink({ link }: { link: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-1.5">
      <span className={HINT_CLASS}>
        Send this link to them yourself (it works once, and is shown only here). Treat it like a password.
      </span>
      <div className="flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${INPUT_CLASS} font-mono text-[11px]`} />
        <Button
          type="button"
          variant="secondary" size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast.success("Link copied.");
            } catch {
              toast.error("Couldn't copy — select the link and copy it manually.");
            }
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}
