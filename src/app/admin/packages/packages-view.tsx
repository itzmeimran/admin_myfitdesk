"use client";

import { useState } from "react";
import type { Package, FormField } from "@/features/packages/mock-data";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { AddIcon, CalendarIcon, CalendarRangeIcon, EditIcon, ArchiveIcon, RestoreIcon, ConfirmIcon } from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const SAND = "var(--sand)";
const LINE = "var(--line)";
const MUTE = "var(--mute)";
const MUTE2 = "var(--mute2)";
const MUTE3 = "var(--mute3)";
const HI = "var(--hi)";
const ONHI = "var(--on-hi)";
const INKLINE = "var(--inkline)";

type Period = "Monthly" | "Yearly";

function cardStyle(pkg: Package) {
  const dark = !!pkg.featured;
  const archived = pkg.state === "Archived";
  return {
    bg: dark ? INK : PAPER,
    edge: dark ? INK : LINE,
    fg: dark ? PAPER : archived ? MUTE : INK,
    muted: dark ? MUTE3 : MUTE2,
    rule: dark ? INKLINE : LINE,
    pillBg: archived ? SAND : dark ? HI : SAND,
    pillFg: archived ? MUTE : dark ? ONHI : INK,
    barFill: dark ? HI : INK,
  };
}

/**
 * Owns the Monthly/Yearly toggle and the "New package" sheet — both real
 * useState-driven client behavior per the task brief. Submitting the form
 * is a deliberate client-side no-op: there is no platform_admins-gated
 * write path yet (see supabase/migrations/1001_platform_admins.sql's
 * header — not applied), so it shows a toast saying exactly that rather
 * than pretending to save.
 */
export function PackagesView({
  monthly,
  yearly,
  formFields,
  featureChips,
  autoOpenSheet,
}: {
  monthly: Package[];
  yearly: Package[];
  formFields: FormField[];
  featureChips: string[];
  autoOpenSheet: boolean;
}) {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [sheetOpen, setSheetOpen] = useState(autoOpenSheet);
  const packages = period === "Yearly" ? yearly : monthly;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Packages</h1>
          <p className="text-[12.5px] text-mute">
            The catalogue every gym buys from. Editing a price never changes what a gym already paid.
          </p>
        </div>
        <div className="flex" role="group" aria-label="Billing period">
          {(["Monthly", "Yearly"] as const).map((p) => {
            const Icon = p === "Monthly" ? CalendarIcon : CalendarRangeIcon;
            const on = period === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => setPeriod(p)}
                className={`-ml-[1.5px] flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11.5px] font-bold first:ml-0 ${
                  on ? "bg-ink text-hi" : "bg-paper text-ink"
                }`}
              >
                <Icon size={14} aria-hidden />
                {p}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-h-[36px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          New package
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {packages.map((pkg) => {
          const s = cardStyle(pkg);
          return (
            <div
              key={pkg.code}
              className="flex flex-1 flex-col gap-3 border-[1.5px] p-4"
              style={{ flexBasis: 280, background: s.bg, borderColor: s.edge, color: s.fg }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-[16px] tracking-[-0.015em]">{pkg.name}</span>
                  <span className="font-mono text-[10.5px]" style={{ color: s.muted }}>
                    {pkg.code}
                  </span>
                </span>
                <span
                  className="flex-shrink-0 px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em]"
                  style={{ background: s.pillBg, color: s.pillFg }}
                >
                  {pkg.state}
                </span>
              </div>

              <span className="flex items-baseline gap-1.5">
                <span className="font-display text-[26px] tracking-[-0.02em]">{pkg.price}</span>
                <span className="text-[12px]" style={{ color: s.muted }}>
                  {pkg.per}
                </span>
              </span>

              <p className="text-[12.5px] leading-relaxed" style={{ color: s.muted }}>
                {pkg.desc}
              </p>

              <div className="flex flex-col gap-1 border-t pt-2.5 text-[12px]" style={{ borderColor: s.rule }}>
                {pkg.caps.map((c) => (
                  <div key={c.k} className="flex items-center justify-between">
                    <span style={{ color: s.muted }}>{c.k}</span>
                    <span className="font-bold">{c.v}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: s.rule }}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span>
                    <span className="font-bold">{pkg.gyms}</span> gyms on this tier
                  </span>
                  <span style={{ color: s.muted }}>{pkg.mrr}</span>
                </div>
                <span className="block h-[8px]" style={{ background: s.rule }}>
                  <span className="block h-[8px]" style={{ width: pkg.share, background: s.barFill }} />
                </span>
                <span className="text-[11px]" style={{ color: s.muted }}>
                  {pkg.share} of platform recurring revenue
                </span>
              </div>

              <div className="mt-auto flex gap-2 border-t pt-3" style={{ borderColor: s.rule }}>
                <button
                  type="button"
                  disabled
                  title="Not implemented yet"
                  className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ borderColor: s.rule }}
                >
                  <EditIcon size={13} aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  disabled
                  title="Not implemented yet"
                  className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ borderColor: s.rule }}
                >
                  {pkg.secondary === "Restore" ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
                  {pkg.secondary}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="max-w-2xl text-[11.5px] leading-relaxed text-mute3">
        Caps are enforced in features/billing/limits.ts. Archiving a tier hides it from new
        purchases but never deletes it — past invoices still reference it.
      </p>

      <NewPackageSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        formFields={formFields}
        featureChips={featureChips}
      />
    </div>
  );
}

function NewPackageSheet({
  open,
  onClose,
  formFields,
  featureChips,
}: {
  open: boolean;
  onClose: () => void;
  formFields: FormField[];
  featureChips: string[];
}) {
  const toast = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    toast.error("Not wired to Supabase yet — pending the platform_admins migration");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Writes one row to platform_packages" title="New package">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="flex flex-wrap gap-3">
          {formFields.map((f) => (
            <label key={f.label} className="flex flex-col gap-1" style={{ flexBasis: f.basis, flexGrow: f.basis === "100%" ? 1 : 0 }}>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
                {f.label}
                {f.required ? <span className="text-accent"> *</span> : null}
              </span>
              {f.inputType === "select" ? (
                <select
                  defaultValue={f.value}
                  required={f.required}
                  className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              ) : f.inputType === "textarea" ? (
                <textarea
                  defaultValue={f.value}
                  placeholder={f.placeholder}
                  required={f.required}
                  rows={2}
                  className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
                />
              ) : (
                <input
                  type={f.inputType}
                  defaultValue={f.value}
                  placeholder={f.placeholder}
                  required={f.required}
                  className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
                />
              )}
              <span className="text-[10.5px] text-mute3">{f.hint}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            What every tier ships with
          </span>
          <p className="text-[11px] text-mute3">
            Only capabilities that are actually shipped are listed — caps are what differ between
            tiers, not features.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {featureChips.map((label) => (
              <span
                key={label}
                className="flex items-center gap-1.5 border-[1.5px] border-ink bg-sand px-2 py-1 text-[10.5px] font-medium text-ink"
              >
                <span aria-hidden="true">✓</span>
                {label}
              </span>
            ))}
          </div>
        </div>

        <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-mute">
          Saving publishes this tier to every gym&apos;s Subscription screen immediately. Existing
          subscriptions are untouched — a gym only moves on its next renewal.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="press-scale flex min-h-[44px] flex-1 items-center justify-center gap-2 border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="press-scale flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
            Publish package
          </button>
        </div>
      </form>
    </Sheet>
  );
}
