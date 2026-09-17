"use client";

import { useState, useTransition, useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SimplePackage } from "@/features/plans/queries";
import {
  setUpPackage,
  savePackageDetails,
  savePricing,
  setTermOffered,
  archiveTerm,
  addFeature,
  removeFeature,
  setBillingModel,
  setPlanStatus,
  goLiveAndArchiveLegacy,
  type PackageFormState,
  type SetupFormState,
} from "@/features/plans/actions";
import { TERMS, listPriceMinor, effectivePriceMinor } from "@/features/plans/terms";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { formatMinorWhole, toMinorUnits } from "@/core/money/format";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  ConfirmIcon,
  ArchiveIcon,
  RestoreIcon,
  AlertIcon,
  ToggleOnIcon,
  ToggleOffIcon,
} from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

/**
 * Every package, one screen. A row of cards picks which package is under
 * management — the selected one carries a terracotta (--accent) border —
 * and everything below it (pricing, capacity, features, terms, archive)
 * acts on whichever package that is. This replaced an earlier "exactly one
 * package" version of this screen once the product grew to sell more than
 * one; the per-package management surface below is otherwise unchanged.
 *
 * The pricing form derives the quarterly/half-yearly/annual list prices
 * from the monthly one (× the term's months) and applies the term's
 * discount on top, so the ladder can't end up inconsistent and the preview
 * below the inputs shows exactly what a gym owner will see before anything
 * is saved.
 */

const initialState: PackageFormState = { error: null };
// A "use server" file may only export async functions, so this constant
// lives here rather than alongside setUpPackage in actions.ts — it broke
// every Server Action in that file on Vercel ("A 'use server' file can
// only export async functions, found object") until moved.
const SETUP_INITIAL: SetupFormState = { error: null, createdId: null };

const CARD = "flex flex-col gap-3 border-[1.5px] border-line bg-paper p-4";
const LABEL = "text-[9px] font-bold uppercase tracking-[0.12em] text-mute";
const INPUT =
  "w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink";
const PRIMARY =
  "press-scale flex min-h-[44px] items-center justify-center gap-2 bg-hi px-4 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70";
const GHOST =
  "flex min-h-[36px] items-center justify-center gap-1.5 border-[1.5px] border-line px-3 text-[11px] font-bold text-ink disabled:cursor-wait disabled:opacity-60";

/** Runs a Server Action that returns `{ error }`, toasting either way and
 * refreshing the Server Component tree on success. Every non-form button on
 * this screen goes through it, so none of them can silently do nothing. */
function useMutation() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function run<T extends { error: string | null }>(key: string, fn: () => Promise<T>, successMessage: string) {
    setBusyKey(key);
    startTransition(async () => {
      const result = await fn();
      setBusyKey(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  return { run, isBusy: (key: string) => isPending && busyKey === key };
}

/** Surfaces a `useActionState` result exactly once per completed submit —
 * the same pattern the legacy packages sheet uses. */
function useActionResult(
  state: PackageFormState,
  onSuccess: (() => void) | undefined,
  successMessage: string,
) {
  const toast = useToast();
  const router = useRouter();
  const [handled, setHandled] = useState(initialState);

  if (state !== handled) {
    setHandled(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state !== initialState) {
      toast.success(successMessage);
      router.refresh();
      onSuccess?.();
    }
  }
}

export function PackageView({
  packages,
  selectedId,
  billingModel,
}: {
  packages: SimplePackage[];
  selectedId: string;
  billingModel: "legacy" | "dynamic";
}) {
  const selected = selectedId === "new" ? null : (packages.find((p) => p.id === selectedId) ?? null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Packages</h1>
        <p className="text-[12.5px] text-mute">
          Every package gym owners can buy. Pick one below to set its price, capacity and features — a
          package sells on up to four terms, each cheaper per month the longer it runs.
        </p>
      </div>

      <LiveBanner billingModel={billingModel} hasPackages={packages.length > 0} />

      <PackagePicker packages={packages} selectedId={selectedId} />

      {selectedId === "new" ? (
        <SetupCard />
      ) : selected ? (
        // Keyed on the package id so every stateful child (the pricing
        // form's controlled inputs above all) remounts with fresh values
        // when the picker switches packages, instead of carrying over the
        // previous package's numbers into inputs that look unchanged.
        <div key={selected.id} className="flex flex-col gap-4">
          <PricingCard pkg={selected} />
          <DetailsCard pkg={selected} />
          <FeaturesCard pkg={selected} />
          <ExtraTermsCard pkg={selected} />
        </div>
      ) : null}

      <p className="text-[11.5px] leading-relaxed text-mute3">
        The old Starter / Growth / Pro tiers still exist at{" "}
        <Link href="/admin/packages/legacy" className="font-bold text-mute underline">
          the tier catalogue
        </Link>
        . Nothing is deleted there — the banner above decides which of the two gym owners actually see.
      </p>
    </div>
  );
}

// ─────────────────────────────── Picker ─────────────────────────────────

function statusLine(pkg: SimplePackage): string {
  if (pkg.monthlyPriceMinor > 0) {
    return `${formatMinorWhole(pkg.monthlyPriceMinor, pkg.currency)} / mo`;
  }
  return "Not priced yet";
}

function PackagePicker({ packages, selectedId }: { packages: SimplePackage[]; selectedId: string }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {packages.map((pkg) => {
        const isSelected = pkg.id === selectedId;
        return (
          <Link
            key={pkg.id}
            href={`/admin/packages?pkg=${pkg.id}`}
            className={`flex flex-col gap-1.5 border-[1.5px] bg-paper p-3.5 transition ${
              isSelected ? "border-[2.5px] border-accent" : "border-line hover:border-ink"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-[12.5px] font-bold">{pkg.name}</span>
              {pkg.status === "archived" ? (
                <span className="flex-shrink-0 border border-line px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-mute">
                  Archived
                </span>
              ) : null}
            </div>
            <span className="text-[11.5px] text-mute">{statusLine(pkg)}</span>
            <span className="text-[10.5px] text-mute3">
              {pkg.gymCount} {pkg.gymCount === 1 ? "gym" : "gyms"}
            </span>
          </Link>
        );
      })}

      <Link
        href="/admin/packages?pkg=new"
        className={`flex min-h-[84px] flex-col items-center justify-center gap-1 border-[1.5px] border-dashed bg-paper p-3.5 text-center transition ${
          selectedId === "new" ? "border-[2.5px] border-accent border-solid" : "border-line hover:border-ink"
        }`}
      >
        <AddIcon size={16} aria-hidden />
        <span className="text-[11.5px] font-bold">New package</span>
      </Link>
    </div>
  );
}

// ─────────────────────────────── Live banner ────────────────────────────

function LiveBanner({ billingModel, hasPackages }: { billingModel: "legacy" | "dynamic"; hasPackages: boolean }) {
  const { run, isBusy } = useMutation();
  const toast = useToast();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const live = billingModel === "dynamic";

  function goLive() {
    startTransition(async () => {
      const result = await goLiveAndArchiveLegacy();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.archivedCount > 0
          ? `Gym owners now see these packages. ${result.archivedCount} old tier${result.archivedCount === 1 ? "" : "s"} retired.`
          : "Gym owners now see these packages.",
      );
      router.refresh();
    });
  }

  if (live) {
    return (
      <div className="flex flex-col gap-3 border-[1.5px] border-ink bg-ink p-3.5 text-paper sm:flex-row sm:flex-wrap sm:items-center">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-mute3">Live</span>
          <span className="text-[12.5px]">Gym owners see the packages below on their subscription screen.</span>
        </span>
        <button
          type="button"
          disabled={isBusy("model")}
          onClick={() => run("model", () => setBillingModel("legacy"), "Gym owners now see the old tiers.")}
          className="flex min-h-[36px] w-full items-center justify-center gap-1.5 border-[1.5px] border-mute px-3 text-[11px] font-bold text-paper disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:justify-start"
        >
          Switch back to the old tiers
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-[1.5px] border-accent bg-paper p-3.5 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertIcon size={18} className="flex-shrink-0 text-accent" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-accent">Not live yet</span>
          <span className="text-[12.5px] text-ink">
            Gym owners still see the old Starter / Growth / Pro tiers. Changes below won&apos;t reach them until
            you go live.
          </span>
        </span>
      </div>
      <button
        type="button"
        disabled={!hasPackages || isPending}
        title={hasPackages ? undefined : "Set up a package first."}
        onClick={goLive}
        className={`${PRIMARY} w-full sm:w-auto`}
      >
        <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
        {isPending ? "Going live…" : "Go live & retire the old tiers"}
      </button>
    </div>
  );
}

// ──────────────────────────────── Pricing ───────────────────────────────

function PricingCard({ pkg }: { pkg: SimplePackage }) {
  const [state, formAction, isPending] = useActionState(savePricing, initialState);
  useActionResult(state, undefined, "Pricing saved.");

  const quarterly = pkg.terms.find((t) => t.key === "quarterly");
  const halfYearly = pkg.terms.find((t) => t.key === "half_yearly");
  const annual = pkg.terms.find((t) => t.key === "annual");

  // Local copies drive the preview table so the ladder updates as the admin
  // types, before anything is written. Keyed on pkg.id via the parent below
  // so switching packages remounts this form with fresh values.
  const [monthly, setMonthly] = useState(String(pkg.monthlyPriceMinor / 100 || ""));
  const [quarterlyOff, setQuarterlyOff] = useState(String(quarterly?.discountPercent ?? 0));
  const [halfYearlyOff, setHalfYearlyOff] = useState(String(halfYearly?.discountPercent ?? 0));
  const [annualOff, setAnnualOff] = useState(String(annual?.discountPercent ?? 0));

  const monthlyMinor = toMinorUnits(monthly) ?? 0;
  const discounts: Record<string, number> = {
    monthly: 0,
    quarterly: Number(quarterlyOff) || 0,
    half_yearly: Number(halfYearlyOff) || 0,
    annual: Number(annualOff) || 0,
  };

  return (
    <form action={formAction} className={CARD}>
      <input type="hidden" name="planId" value={pkg.id} />

      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[17px] tracking-[-0.02em]">Pricing — {pkg.name}</h2>
        <p className="text-[11.5px] text-mute">
          A longer term is that many months of the monthly price — the discount is what makes it worth
          taking.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1" style={{ flexBasis: 180 }}>
          <span className={LABEL}>
            Monthly price (₹)<span className="text-accent"> *</span>
          </span>
          <input
            type="number"
            name="monthlyPrice"
            min="1"
            step="1"
            required
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="1499"
            className={INPUT}
          />
          <span className="text-[10.5px] text-mute3">Everything else is derived from this.</span>
        </label>

        <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
          <span className={LABEL}>Quarterly discount (%)</span>
          <input
            type="number"
            name="quarterlyDiscount"
            min="0"
            max="99"
            step="1"
            value={quarterlyOff}
            onChange={(e) => setQuarterlyOff(e.target.value)}
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
          <span className={LABEL}>Half-Yearly discount (%)</span>
          <input
            type="number"
            name="halfYearlyDiscount"
            min="0"
            max="99"
            step="1"
            value={halfYearlyOff}
            onChange={(e) => setHalfYearlyOff(e.target.value)}
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
          <span className={LABEL}>Annual discount (%)</span>
          <input
            type="number"
            name="annualDiscount"
            min="0"
            max="99"
            step="1"
            value={annualOff}
            onChange={(e) => setAnnualOff(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      <div className="flex flex-col border-t border-line pt-3">
        <span className={LABEL}>What a gym owner will see</span>
        <div className="mt-2 flex flex-col gap-2">
          {TERMS.map((term) => {
            const current = pkg.terms.find((t) => t.key === term.key);
            const list = listPriceMinor(monthlyMinor, term);
            const discount = discounts[term.key] ?? 0;
            const pays = effectivePriceMinor(list, discount);
            const perMonth = Math.round(pays / term.months);
            return (
              <div
                key={term.key}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2 last:border-0 last:pb-0"
              >
                <span className="w-[92px] text-[12.5px] font-bold">{term.label}</span>
                <span className="flex items-baseline gap-2">
                  {discount > 0 ? (
                    <span className="text-[12px] text-mute3 line-through">{formatMinorWhole(list, pkg.currency)}</span>
                  ) : null}
                  <span className="font-display text-[18px] tracking-[-0.02em]">
                    {formatMinorWhole(pays, pkg.currency)}
                  </span>
                </span>
                <span className="text-[11.5px] text-mute">
                  {formatMinorWhole(perMonth, pkg.currency)} / month
                  {discount > 0 ? ` · ${discount}% off` : ""}
                </span>
                <span className="ml-auto text-[11px] text-mute3">
                  {current?.cycleId
                    ? `${current.gymCount} ${current.gymCount === 1 ? "gym" : "gyms"}`
                    : "Will be created on save"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button type="submit" disabled={isPending} className={PRIMARY}>
          <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
          {isPending ? "Saving…" : "Save pricing"}
        </button>
        <span className="text-[11px] leading-relaxed text-mute3">
          Repricing never changes what a gym already paid — it applies from their next renewal.
        </span>
      </div>

      <TermVisibility pkg={pkg} />
    </form>
  );
}

function TermVisibility({ pkg }: { pkg: SimplePackage }) {
  const { run, isBusy } = useMutation();
  const offerable = pkg.terms.filter((t) => t.cycleId);
  if (offerable.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className={LABEL}>Terms offered to new gyms</span>
      <div className="flex flex-wrap gap-2">
        {offerable.map((term) => {
          const Icon = term.isPurchasable ? ToggleOnIcon : ToggleOffIcon;
          return (
            <button
              key={term.key}
              type="button"
              disabled={isBusy(term.key)}
              onClick={() =>
                run(
                  term.key,
                  () => setTermOffered(term.cycleId as string, !term.isPurchasable),
                  term.isPurchasable ? `${term.label} hidden from new gyms.` : `${term.label} is back on offer.`,
                )
              }
              className={`${GHOST} ${term.isPurchasable ? "border-ink" : "opacity-70"}`}
            >
              <Icon size={15} aria-hidden />
              {term.label}
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-mute3">
        Hiding a term stops new gyms choosing it. A gym already on it keeps renewing.
      </span>
    </div>
  );
}

// ─────────────────────────────── Details ────────────────────────────────

function capLabel(value: number | null) {
  return value === null ? "No limit" : value.toLocaleString("en-IN");
}

function DetailsCard({ pkg }: { pkg: SimplePackage }) {
  const [open, setOpen] = useState(false);
  const { run, isBusy } = useMutation();
  const archived = pkg.status === "archived";

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-display text-[17px] tracking-[-0.02em]">{pkg.name}</h2>
          <p className="text-[12.5px] text-mute">
            {pkg.description || "No description yet — gym owners see this under the package name."}
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button type="button" onClick={() => setOpen(true)} className={GHOST}>
            <EditIcon size={13} aria-hidden />
            Edit
          </button>
          <button
            type="button"
            disabled={isBusy("status")}
            onClick={() =>
              run(
                "status",
                () => setPlanStatus(pkg.id, archived ? "active" : "archived"),
                archived ? `${pkg.name} restored.` : `${pkg.name} archived.`,
              )
            }
            className={GHOST}
          >
            {archived ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
            {archived ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-2.5 text-[12.5px]">
        {[
          { k: "Branches", v: capLabel(pkg.maxBranches) },
          { k: "Members", v: capLabel(pkg.maxMembers) },
          { k: "Staff logins", v: capLabel(pkg.maxStaff) },
        ].map((row) => (
          <div key={row.k} className="flex items-center justify-between">
            <span className="text-mute">{row.k}</span>
            <span className="font-bold">{row.v}</span>
          </div>
        ))}
      </div>

      <span className="text-[11px] text-mute3">
        Limits are the same on every term and are enforced when a gym adds a branch, member or staff login.
        {archived ? " Archived — hidden from new gyms until restored." : ""}
      </span>

      {/* Remounting on open clears any stale useActionState result from a
          previous edit, so a fresh open never shows a past submit's error. */}
      {open ? <DetailsSheet key={pkg.id} pkg={pkg} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function DetailsSheet({ pkg, onClose }: { pkg: SimplePackage; onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(savePackageDetails, initialState);
  useActionResult(state, onClose, "Package updated.");

  return (
    <Sheet open onClose={onClose} eyebrow="What gym owners get" title={`Edit ${pkg.name}`}>
      <form action={formAction} className="flex flex-col gap-3.5">
        <input type="hidden" name="planId" value={pkg.id} />

        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Package name<span className="text-accent"> *</span>
          </span>
          <input type="text" name="name" defaultValue={pkg.name} required maxLength={120} className={INPUT} />
        </label>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Description</span>
          <textarea
            name="description"
            defaultValue={pkg.description}
            rows={2}
            maxLength={500}
            placeholder="One sentence, shown under the package name"
            className={`${INPUT} resize-none`}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          {[
            { name: "maxBranches", label: "Max branches", value: pkg.maxBranches, hint: "Checked when a branch is added" },
            { name: "maxMembers", label: "Max members", value: pkg.maxMembers, hint: "Blocks new members at the limit" },
            { name: "maxStaff", label: "Max staff logins", value: pkg.maxStaff, hint: "Staff and trainer logins" },
          ].map((cap) => (
            <label key={cap.name} className="flex flex-col gap-1" style={{ flexBasis: 150, flexGrow: 1 }}>
              <span className={LABEL}>{cap.label}</span>
              <input
                type="number"
                name={cap.name}
                min="1"
                step="1"
                defaultValue={cap.value ?? ""}
                placeholder="Blank = no limit"
                className={INPUT}
              />
              <span className="text-[10.5px] text-mute3">{cap.hint}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={onClose}
            className="press-scale flex min-h-[44px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            Cancel
          </button>
          <button type="submit" disabled={isPending} className={`${PRIMARY} flex-1`}>
            <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// ─────────────────────────────── Features ───────────────────────────────

function FeaturesCard({ pkg }: { pkg: SimplePackage }) {
  const [state, formAction, isPending] = useActionState(addFeature, initialState);
  useActionResult(state, undefined, "Feature added.");
  const { run, isBusy } = useMutation();

  return (
    <div className={CARD}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[17px] tracking-[-0.02em]">What&apos;s included</h2>
        <p className="text-[11.5px] text-mute">
          The selling points listed under the package on a gym owner&apos;s subscription screen. Display only — the
          limits above are what the app actually enforces.
        </p>
      </div>

      {pkg.features.length > 0 ? (
        <ul className="flex flex-col">
          {pkg.features.map((feature) => (
            <li
              key={feature.id}
              className="flex items-center gap-2 border-b border-line py-2 text-[12.5px] last:border-0"
            >
              <span className="min-w-0 flex-1">{feature.name}</span>
              <button
                type="button"
                aria-label={`Remove ${feature.name}`}
                disabled={isBusy(feature.id)}
                onClick={() => run(feature.id, () => removeFeature(feature.id), `${feature.name} removed.`)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-mute disabled:opacity-40"
              >
                <DeleteIcon size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-mute3">Nothing listed yet.</p>
      )}

      {/* key resets the input after each successful add without a controlled
          value — the list above is the confirmation that it landed. */}
      <form key={pkg.features.length} action={formAction} className="flex flex-wrap gap-2 border-t border-line pt-3">
        <input type="hidden" name="planId" value={pkg.id} />
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. WhatsApp reminders"
          className={`${INPUT} min-w-0 flex-1`}
          style={{ flexBasis: 200 }}
        />
        <button type="submit" disabled={isPending} className={PRIMARY}>
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          {isPending ? "Adding…" : "Add"}
        </button>
      </form>
    </div>
  );
}

// ──────────────────────── Terms this screen doesn't own ─────────────────

function ExtraTermsCard({ pkg }: { pkg: SimplePackage }) {
  const { run, isBusy } = useMutation();
  const extras = pkg.extraTerms.filter((c) => c.status === "active");
  if (extras.length === 0) return null;

  return (
    <div className={`${CARD} border-accent`}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[17px] tracking-[-0.02em]">Other billing terms</h2>
        <p className="text-[11.5px] text-mute">
          These were created before this screen was simplified and aren&apos;t monthly, quarterly, half-yearly
          or annual, so the pricing form above doesn&apos;t manage them. Gym owners can still buy them until
          they&apos;re retired.
        </p>
      </div>
      <ul className="flex flex-col">
        {extras.map((cycle) => (
          <li key={cycle.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0">
            <span className="text-[12.5px] font-bold">{cycle.billingPeriod}</span>
            <span className="text-[12px] text-mute">
              {formatMinorWhole(cycle.priceMinor, cycle.currency)} · {cycle.durationDays} days ·{" "}
              {cycle.gymCount} {cycle.gymCount === 1 ? "gym" : "gyms"}
            </span>
            <button
              type="button"
              disabled={isBusy(cycle.id)}
              onClick={() => run(cycle.id, () => archiveTerm(cycle.id), `${cycle.billingPeriod} retired.`)}
              className={`${GHOST} ml-auto`}
            >
              <ArchiveIcon size={13} aria-hidden />
              {isBusy(cycle.id) ? "Retiring…" : "Retire"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────── First-time setup ────────────────────────

function SetupCard() {
  const [state, formAction, isPending] = useActionState(setUpPackage, SETUP_INITIAL);
  const toast = useToast();
  const router = useRouter();
  const [handled, setHandled] = useState(SETUP_INITIAL);

  if (state !== handled) {
    setHandled(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state.createdId) {
      toast.success("Package created.");
      router.push(`/admin/packages?pkg=${state.createdId}`);
      router.refresh();
    }
  }

  const [monthly, setMonthly] = useState("");
  const monthlyMinor = toMinorUnits(monthly) ?? 0;

  return (
    <form action={formAction} className={CARD}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-[17px] tracking-[-0.02em]">New package</h2>
        <p className="text-[11.5px] text-mute">
          One submit creates the package and all four billing terms. Discounts come next, on the pricing form.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>
          Package name<span className="text-accent"> *</span>
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. MyFitDesk Pro"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Description</span>
        <textarea
          name="description"
          rows={2}
          maxLength={500}
          placeholder="One sentence, shown under the package name"
          className={`${INPUT} resize-none`}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1" style={{ flexBasis: 180, flexGrow: 1 }}>
          <span className={LABEL}>
            Monthly price (₹)<span className="text-accent"> *</span>
          </span>
          <input
            type="number"
            name="monthlyPrice"
            min="1"
            step="1"
            required
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="1499"
            className={INPUT}
          />
          <span className="text-[10.5px] text-mute3">
            {monthlyMinor > 0
              ? `Quarterly starts at ${formatMinorWhole(monthlyMinor * 3)}, half-yearly at ${formatMinorWhole(
                  monthlyMinor * 6,
                )}, annual at ${formatMinorWhole(monthlyMinor * 12)} before discount.`
              : "Every longer term is derived from this."}
          </span>
        </label>

        {[
          { name: "maxBranches", label: "Max branches" },
          { name: "maxMembers", label: "Max members" },
          { name: "maxStaff", label: "Max staff logins" },
        ].map((cap) => (
          <label key={cap.name} className="flex flex-col gap-1" style={{ flexBasis: 150, flexGrow: 1 }}>
            <span className={LABEL}>{cap.label}</span>
            <input
              type="number"
              name={cap.name}
              min="1"
              step="1"
              placeholder="Blank = no limit"
              className={INPUT}
            />
          </label>
        ))}
      </div>

      <div className="border-t border-line pt-3">
        <button type="submit" disabled={isPending} className={PRIMARY}>
          <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
          {isPending ? "Creating…" : "Create package"}
        </button>
      </div>
    </form>
  );
}
