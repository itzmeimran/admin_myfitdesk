"use client";

import { useId, useState } from "react";
import { saveDefaultSettings, type SettingsFormState } from "@/features/settings/settings-actions";
import type { PlatformSettings } from "@/features/settings/platform-settings";
import { SettingsForm } from "../_components/settings-form";
import { Field, INPUT_CLASS } from "../_components/ui";

const INITIAL_STATE: SettingsFormState = { error: null, saved: null, nonce: 0 };

export function DefaultsForm({
  values,
  timezones,
  canEdit,
}: {
  values: PlatformSettings;
  timezones: string[];
  canEdit: boolean;
}) {
  const listId = useId();
  const [trialDays, setTrialDays] = useState(String(values.trialDays));
  const [graceDays, setGraceDays] = useState(String(values.graceDays));
  const [country, setCountry] = useState(values.country);
  const [currency, setCurrency] = useState(values.currency);
  const [timezone, setTimezone] = useState(values.timezone);

  return (
    <SettingsForm action={saveDefaultSettings} initialState={INITIAL_STATE} disabled={!canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Default trial length (days)" required hint="1 to 365. Pre-fills the trial option when inviting a gym owner.">
          <input name="trialDays" type="number" inputMode="numeric" min={1} max={365} step={1} required value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field label="Default grace period (days)" required hint="0 to 60. How long a new gym keeps access after its subscription ends, before going read-only.">
          <input name="graceDays" type="number" inputMode="numeric" min={0} max={60} step={1} required value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field label="Default country" required>
          <input name="country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} required className={INPUT_CLASS} />
        </Field>
        <Field label="Default currency" required hint="3-letter code, e.g. INR.">
          <input name="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} minLength={3} required className={`${INPUT_CLASS} uppercase`} />
        </Field>
        <Field label="Default timezone" required hint="IANA name, e.g. Asia/Kolkata. Pick from the list or type one.">
          <input name="timezone" list={listId} value={timezone} onChange={(e) => setTimezone(e.target.value)} required className={INPUT_CLASS} />
          <datalist id={listId}>
            {timezones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </Field>
      </div>
    </SettingsForm>
  );
}
