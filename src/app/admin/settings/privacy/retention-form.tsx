"use client";

import { useState } from "react";
import { saveApiRetention, type RetentionFormState } from "@/features/settings/privacy-actions";
import { useAdminEnvironment } from "@/core/env/context";
import { SettingsForm } from "../_components/settings-form";
import { Field, INPUT_CLASS } from "../_components/ui";

const INITIAL_STATE: RetentionFormState = { error: null, saved: false, nonce: 0 };

export function RetentionForm({ rawDays, hourlyDays, canEdit }: { rawDays: number; hourlyDays: number; canEdit: boolean }) {
  const environment = useAdminEnvironment();
  const [raw, setRaw] = useState(String(rawDays));
  const [hourly, setHourly] = useState(String(hourlyDays));
  const [confirmation, setConfirmation] = useState("");
  const shortening = Number(raw) < rawDays || Number(hourly) < hourlyDays;

  return (
    <SettingsForm action={saveApiRetention} initialState={INITIAL_STATE} disabled={!canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Raw requests (days)" required hint="Individual request records. 1 to 30.">
          <input name="rawDays" type="number" inputMode="numeric" min={1} max={30} required value={raw} onChange={(e) => setRaw(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field label="Hourly summaries (days)" required hint="Aggregated hourly figures. 7 to 365, at least as long as raw.">
          <input name="hourlyDays" type="number" inputMode="numeric" min={7} max={365} required value={hourly} onChange={(e) => setHourly(e.target.value)} className={INPUT_CLASS} />
        </Field>
      </div>
      {environment === "prod" && shortening ? (
        <Field label="Type PRODUCTION to confirm shortening retention" required>
          <input name="confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" placeholder="PRODUCTION" className={`${INPUT_CLASS} border-accent font-bold`} />
        </Field>
      ) : (
        <input type="hidden" name="confirmation" value={environment === "prod" ? "PRODUCTION" : ""} />
      )}
    </SettingsForm>
  );
}
