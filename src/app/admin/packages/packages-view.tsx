"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { Package } from "@/features/packages/mock-data";
import { createPackage, updatePackage, setPackageStatus, type PackageFormState } from "@/features/packages/actions";
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
 * Owns the Monthly/Yearly toggle and the New/Edit package sheet — real
 * writes now (src/features/packages/actions.ts → the admin_* RPCs in
 * supabase/migrations/1003_admin_package_write_rpcs.sql). Archive/Restore
 * call setPackageStatus directly (no form needed for a single-field
 * change); both mutation paths call router.refresh() on success so the
 * Server Component re-fetches immediately instead of waiting for the next
 * navigation to pick up revalidatePath's effect.
 */
export function PackagesView({
  monthly,
  yearly,
  featureChips,
  autoOpenSheet,
}: {
  monthly: Package[];
  yearly: Package[];
  featureChips: string[];
  autoOpenSheet: boolean;
}) {
  const [period, setPeriod] = useState<Period>("Monthly");
  const [sheetOpen, setSheetOpen] = useState(autoOpenSheet);
  const [editing, setEditing] = useState<Package | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const packages = period === "Yearly" ? yearly : monthly;

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(pkg: Package) {
    setEditing(pkg);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditing(null);
  }

  function handleToggleArchive(pkg: Package) {
    const nextStatus = pkg.state === "Archived" ? "active" : "archived";
    setArchiving(pkg.raw.id);
    startTransition(async () => {
      const { error } = await setPackageStatus(pkg.raw.id, nextStatus);
      setArchiving(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(nextStatus === "archived" ? `${pkg.name} archived.` : `${pkg.name} restored.`);
      router.refresh();
    });
  }

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
          onClick={openCreate}
          className="flex min-h-[36px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          New package
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {packages.map((pkg) => {
          const s = cardStyle(pkg);
          const isArchivingThis = isPending && archiving === pkg.raw.id;
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
                  onClick={() => openEdit(pkg)}
                  className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] text-[11px] font-bold"
                  style={{ borderColor: s.rule }}
                >
                  <EditIcon size={13} aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={isArchivingThis}
                  onClick={() => handleToggleArchive(pkg)}
                  className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                  style={{ borderColor: s.rule }}
                >
                  {pkg.secondary === "Restore" ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
                  {isArchivingThis ? "Working…" : pkg.secondary}
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

      <PackageSheet
        open={sheetOpen}
        onClose={closeSheet}
        featureChips={featureChips}
        editing={editing}
        onSaved={() => {
          closeSheet();
          router.refresh();
        }}
      />
    </div>
  );
}

const initialFormState: PackageFormState = { error: null };

function PackageSheet({
  open,
  onClose,
  featureChips,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  featureChips: string[];
  editing: Package | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const action = editing ? updatePackage : createPackage;
  const [state, formAction, isPending] = useActionState(action, initialFormState);

  // Surface the result as a toast, then close+refresh only on success —
  // useActionState re-runs this component with the new state on every
  // submit, so this fires exactly once per completed action.
  const [lastHandledState, setLastHandledState] = useState(initialFormState);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state !== initialFormState) {
      toast.success(editing ? "Package updated." : "Package published.");
      onSaved();
    }
  }

  const isEditing = !!editing;
  const raw = editing?.raw;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      eyebrow={isEditing ? "Updates one row in platform_packages" : "Writes one row to platform_packages"}
      title={isEditing ? `Edit ${editing?.name}` : "New package"}
    >
      <form action={formAction} className="flex flex-col gap-3.5">
        {isEditing && raw ? <input type="hidden" name="id" value={raw.id} /> : null}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1" style={{ flexBasis: 220 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Display name<span className="text-accent"> *</span>
            </span>
            <input
              type="text"
              name="name"
              defaultValue={isEditing ? editing?.name : ""}
              placeholder="Shown to gym owners"
              required
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">platform_packages.name</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 220 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Code</span>
            {isEditing ? (
              <input
                type="text"
                defaultValue={editing?.code}
                disabled
                className="w-full border-[1.5px] border-line bg-sand px-2.5 py-2 text-[13px] text-mute outline-none"
              />
            ) : (
              <input
                type="text"
                name="code"
                placeholder="tier_period"
                required
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            )}
            <span className="text-[10.5px] text-mute3">
              {isEditing ? "Never changes once a package exists." : "Stable machine name, unique, never reused"}
            </span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Price (₹)<span className="text-accent"> *</span>
            </span>
            <input
              type="number"
              name="price"
              min="0"
              step="1"
              defaultValue={isEditing && raw ? String(raw.priceMinor / 100) : ""}
              placeholder="549"
              required
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">Stored as price_minor — 549 becomes 54900</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 170 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Billing period<span className="text-accent"> *</span>
            </span>
            {isEditing ? (
              <input
                type="text"
                defaultValue={editing?.per === "/ year" ? "Yearly" : "Monthly"}
                disabled
                className="w-full border-[1.5px] border-line bg-sand px-2.5 py-2 text-[13px] text-mute outline-none"
              />
            ) : (
              <select
                name="billingPeriod"
                defaultValue="Monthly"
                required
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              >
                <option value="Monthly">Monthly</option>
                <option value="Yearly">Yearly</option>
              </select>
            )}
            <span className="text-[10.5px] text-mute3">
              {isEditing ? "Create a new package to change this." : "Yearly rows are priced at 10× monthly today"}
            </span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Duration (days)<span className="text-accent"> *</span>
            </span>
            <input
              type="number"
              name="durationDays"
              min="1"
              step="1"
              defaultValue={isEditing && raw ? String(raw.durationDays) : "30"}
              required
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">Explicit, so a 3-for-2 offer is just a row</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Max branches</span>
            <input
              type="number"
              name="maxBranches"
              min="1"
              step="1"
              defaultValue={isEditing && raw ? raw.maxBranches ?? "" : ""}
              placeholder="Blank = unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">Enforced on branch creation</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Max members</span>
            <input
              type="number"
              name="maxMembers"
              min="1"
              step="1"
              defaultValue={isEditing && raw ? raw.maxMembers ?? "" : ""}
              placeholder="Blank = unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">Blocks new members at the cap</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Max staff</span>
            <input
              type="number"
              name="maxStaff"
              min="1"
              step="1"
              defaultValue={isEditing && raw ? raw.maxStaff ?? "" : ""}
              placeholder="Blank = unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">Counts staff and trainer logins</span>
          </label>

          <label className="flex flex-col gap-1" style={{ flexBasis: "100%", flexGrow: 1 }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Description</span>
            <textarea
              name="description"
              defaultValue={isEditing ? raw?.description : ""}
              placeholder="One sentence"
              rows={2}
              className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <span className="text-[10.5px] text-mute3">
              Shown under the tier name on the owner&apos;s Subscription screen
            </span>
          </label>
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
          {isEditing
            ? "Updates the tier for every gym on it immediately — a gym's already-agreed price is untouched, only the catalogue entry changes."
            : "Saving publishes this tier to every gym's Subscription screen immediately. Existing subscriptions are untouched — a gym only moves on its next renewal."}
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
            disabled={isPending}
            className="press-scale flex min-h-[44px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
          >
            <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
            {isPending ? "Saving…" : isEditing ? "Save changes" : "Publish package"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
