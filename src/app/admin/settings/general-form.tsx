"use client";

import { useState } from "react";
import { saveGeneralSettings, type SettingsFormState } from "@/features/settings/settings-actions";
import type { PlatformSettings } from "@/features/settings/platform-settings";
import { SettingsForm } from "./_components/settings-form";
import { Field, INPUT_CLASS } from "./_components/ui";

const INITIAL_STATE: SettingsFormState = { error: null, saved: null, nonce: 0 };

export function GeneralForm({ values, canEdit }: { values: PlatformSettings; canEdit: boolean }) {
  const [name, setName] = useState(values.platformName);
  const [email, setEmail] = useState(values.supportEmail);
  const [phone, setPhone] = useState(values.supportPhone);
  const [address, setAddress] = useState(values.contactAddress);

  return (
    <SettingsForm action={saveGeneralSettings} initialState={INITIAL_STATE} disabled={!canEdit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Platform name" required hint="Shown in email headers and footers.">
          <input name="platformName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={INPUT_CLASS} />
        </Field>
        <Field label="Support email" hint="Where gym owners and admins should write. Leave blank to omit.">
          <input name="supportEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} placeholder="support@myfitdesk.app" className={INPUT_CLASS} />
        </Field>
        <Field label="Support phone" hint="Digits, spaces and + ( ) - only. Leave blank to omit.">
          <input name="supportPhone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={24} placeholder="+91 98765 43210" className={INPUT_CLASS} />
        </Field>
        <Field label="Contact address" hint="Optional. Up to 300 characters.">
          <textarea name="contactAddress" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={3} className={INPUT_CLASS} />
        </Field>
      </div>
    </SettingsForm>
  );
}
