"use client";

import { ConfirmedForm } from '@/components/ConfirmedForm';
import { ButtonLink } from "@/components/ButtonLink";
import { useActionConfirmation } from '@/components/ActionConfirmationProvider';
import { Button } from "@/components/Button";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAdminEnvironment } from "@/core/env/context";
import { formatMinorWhole, toMinorUnits } from "@/core/money/format";
import {
  AddIcon,
  EditIcon,
  DeleteIcon,
  ConfirmIcon,
  ArchiveIcon,
  RestoreIcon,
  AlertIcon,
} from "@/core/ui/icons";
import { Toggle } from "@/components/Toggle";
import { CancelIcon } from '@/core/ui/icons';

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

/** Runs a Server Action that returns `{ error }`, toasting either way and
 * refreshing the Server Component tree on success. Every non-form button on
 * this screen goes through it, so none of them can silently do nothing. */
function useMutation() {
  const router = useRouter(); const toast = useToast(); const confirmAction = useActionConfirmation();
  const [isPending, setPending] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  function run(key: string, action: () => Promise<{ error: string | null }>, successMessage: string) {
    void confirmAction({title:'Are you sure?',description:"Apply this package change? It may affect the plans gym owners see."}, async () => {
      setBusyKey(key); setPending(true);
      try {
        const result = await action();
        if (result.error) { toast.error(result.error); return; }
        toast.success(successMessage);  router.refresh();
      } finally { setBusyKey(null); setPending(false); }
    });
  }
  return {run,isBusy: (key: string) => isPending && busyKey === key};
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
      <p className="border-[1.5px] border-line bg-sand p-3 text-[12px] leading-relaxed text-mute">
        Price changes apply to existing AutoPay customers at their next renewal. Their paid period stays unchanged; they must authorize the updated price after their previous mandate is stopped. Review pending changes in each gym&apos;s Billing tab.
      </p>

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
          <ButtonLink
            key={pkg.id}
            href={`/admin/packages?pkg=${pkg.id}`}
            variant="secondary" layout="content" size="custom" className={`flex flex-col gap-1.5 border-[1.5px] bg-paper p-3.5 ${isSelected ? "border-[2.5px] border-accent" : "border-line hover:border-ink"} `}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate text-[12.5px] font-bold">{pkg.name}</span>
              {pkg.status === "archived" ? (
                <span className="flex-shrink-0 border border-line px-1.5 py-0.5 text-[9px] font-bold normal-case tracking-[0.1em] text-mute">
                  Archived
                </span>
              ) : null}
            </div>
            <span className="text-[11.5px] text-mute">{statusLine(pkg)}</span>
            <span className="text-[10.5px] text-mute3">
              {pkg.gymCount} {pkg.gymCount === 1 ? "gym" : "gyms"}
            </span>
          </ButtonLink>
        );
      })}

      <ButtonLink
        href="/admin/packages?pkg=new"
        variant="secondary" layout="content" size="custom" className={`flex min-h-[84px] flex-col items-center justify-center gap-1 border-[1.5px] border-dashed bg-paper p-3.5 text-center ${selectedId === "new" ? "border-[2.5px] border-accent border-solid" : "border-line hover:border-ink"} `}
      >
        <AddIcon size={16} aria-hidden />
        <span className="text-[11.5px] font-bold">New package</span>
      </ButtonLink>
    </div>
  );
}

// ─────────────────────────────── Live banner ────────────────────────────

function LiveBanner({ billingModel, hasPackages }: { billingModel: "legacy" | "dynamic"; hasPackages: boolean }) {
  const { run, isBusy } = useMutation();
  const toast = useToast();
  const router = useRouter();
  const environment = useAdminEnvironment();
  const [isPending, startTransition] = useTransition();
  const [confirmGoLive, setConfirmGoLive] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const live = billingModel === "dynamic";
  const prodConfirm = environment === "prod" ? "PRODUCTION" : undefined;

  function goLive() {
    setConfirmGoLive(false);
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
        <Button icon={RestoreIcon}
          type="button"
          disabled={isBusy("model")}
          onClick={() => setConfirmRevert(true)}
          variant="ghost" tone="inverse" size="sm" className="w-full border-mute sm:w-auto sm:justify-start"
        >
          Switch back to the old tiers
        </Button>
        <ConfirmDialog
          open={confirmRevert}
          danger
          title="Switch buyers back to the old tiers?"
          description="Every gym owner's subscription screen immediately goes back to showing the legacy Starter/Growth/Pro tiers instead of this package."
          confirmLabel="Switch back"
          pending={isBusy("model")}
          requireTypedConfirmation={prodConfirm}
          onConfirm={() => {
            setConfirmRevert(false);
            run("model", () => setBillingModel("legacy"), "Gym owners now see the old tiers.");
          }}
          onCancel={() => setConfirmRevert(false)}
        />
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
      <Button pending={isPending} icon={ConfirmIcon}
        type="button"
        disabled={!hasPackages || isPending}
        title={hasPackages ? undefined : "Set up a package first."}
        onClick={() => setConfirmGoLive(true)}
        variant="primary" size="lg" className="w-full sm:w-auto"
      >
        {isPending ? "Going live…" : "Go live & retire the old tiers"}
      </Button>
      <ConfirmDialog
        open={confirmGoLive}
        danger
        title="Go live with this package?"
        description="Gym owners will immediately see this package instead of the old tiers, and any old tier still active will be retired."
        confirmLabel="Go live"
        pending={isPending}
        requireTypedConfirmation={prodConfirm}
        onConfirm={goLive}
        onCancel={() => setConfirmGoLive(false)}
      />
    </div>
  );
}

// ──────────────────────────────── Pricing ───────────────────────────────

const TH = "text-[10px] font-bold uppercase tracking-[0.14em] text-mute";

function PricingCard({ pkg }: { pkg: SimplePackage }) {
  const [state, formAction, isPending] = useActionState(savePricing, initialState);
  useActionResult(state, undefined, "Pricing saved.");
  const { run, isBusy } = useMutation();

  // Local copies drive the owner-pays column so the ladder updates as the
  // admin types, before anything is written. Keyed on pkg.id via the parent
  // so switching packages remounts this form with fresh values.
  const [monthly, setMonthly] = useState(String(pkg.monthlyPriceMinor / 100 || ""));
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      TERMS.filter((t) => t.key !== "monthly").map((t) => [
        t.key,
        String(pkg.terms.find((x) => x.key === t.key)?.discountPercent ?? 0),
      ]),
    ),
  );
  const monthlyMinor = toMinorUnits(monthly) ?? 0;
  // Compared against the saved package (props), so the button re-disables
  // once a save refreshes the page and the form matches the database again.
  const dirty =
    monthlyMinor !== pkg.monthlyPriceMinor ||
    TERMS.some(
      (t) =>
        t.key !== "monthly" &&
        (Number(discountInputs[t.key]) || 0) !== (pkg.terms.find((x) => x.key === t.key)?.discountPercent ?? 0),
    );
  const FIELD_NAME: Record<string, string> = {
    quarterly: "quarterlyDiscount",
    half_yearly: "halfYearlyDiscount",
    annual: "annualDiscount",
  };

  return (
    <ConfirmedForm
      confirmation="Save these package changes? They can affect what gym owners see."
      action={formAction}
      className={CARD}
    >
      <input type="hidden" name="planId" value={pkg.id} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[26px] tracking-[-0.02em]">Pricing</h2>
          <p className="text-[13px] text-mute">Set the monthly price. Longer terms are derived from it.</p>
        </div>
        <Button
          pending={isPending}
          icon={ConfirmIcon}
          type="submit"
          disabled={isPending || !dirty}
          title={dirty ? undefined : "No changes to save"}
          variant="primary"
          size="lg"
        >
          {isPending ? "Saving…" : "Save pricing"}
        </Button>
      </div>

      <label className="mt-2 flex flex-col gap-2">
        <span className={TH}>
          Monthly price<span className="text-accent"> *</span>
        </span>
        <span className="flex w-fit items-baseline gap-2 border-b-2 border-ink pb-1 pr-6">
          <span className="font-display text-[32px] text-mute3">₹</span>
          <input
            type="number"
            name="monthlyPrice"
            min="1"
            step="1"
            required
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="1499"
            className="w-[200px] bg-transparent font-display text-[48px] leading-none tracking-[-0.02em] text-ink outline-none"
          />
        </span>
      </label>

      <div className="mt-2 overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[1.2fr_1fr_1.6fr_0.7fr_auto] items-center gap-3 border-b-2 border-ink pb-3">
            <span className={TH}>Term</span>
            <span className={TH}>Discount</span>
            <span className={TH}>Owner pays</span>
            <span className={`${TH} text-right`}>Gyms</span>
            <span className={`${TH} w-16 text-right`}>Offered</span>
          </div>
          {TERMS.map((term) => {
            const current = pkg.terms.find((t) => t.key === term.key);
            const isBase = term.key === "monthly";
            const discount = isBase ? 0 : Number(discountInputs[term.key]) || 0;
            const list = listPriceMinor(monthlyMinor, term);
            const pays = effectivePriceMinor(list, discount);
            const perMonth = Math.round(pays / term.months);
            const gyms = current?.gymCount ?? 0;
            return (
              <div
                key={term.key}
                className="grid grid-cols-[1.2fr_1fr_1.6fr_0.7fr_auto] items-center gap-3 border-b border-line py-4"
              >
                <span className="font-display text-[18px] tracking-[-0.01em]">{term.label}</span>
                {isBase ? (
                  <span className="text-[13px] text-mute">Base</span>
                ) : (
                  <label className="flex w-[100px] items-center border-[1.5px] border-line bg-paper focus-within:border-ink">
                    <input
                      type="number"
                      name={FIELD_NAME[term.key]}
                      aria-label={`${term.label} discount (%)`}
                      min="0"
                      max="99"
                      step="1"
                      value={discountInputs[term.key]}
                      onChange={(e) => setDiscountInputs((d) => ({ ...d, [term.key]: e.target.value }))}
                      className="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-bold text-[15px] text-ink outline-none"
                    />
                    <span className="pr-2.5 text-[13px] text-mute">%</span>
                  </label>
                )}
                <span className="flex flex-col">
                  <span className="font-display text-[20px] tracking-[-0.02em]">
                    {formatMinorWhole(pays, pkg.currency)}
                  </span>
                  <span className="text-[12px] text-mute">
                    {isBase
                      ? "per month"
                      : `${formatMinorWhole(perMonth, pkg.currency)}/mo${
                          discount > 0 ? ` · was ${formatMinorWhole(list, pkg.currency)}` : ""
                        }`}
                  </span>
                </span>
                <span className="text-right text-[13px] text-mute">
                  {current?.cycleId ? `${gyms} ${gyms === 1 ? "gym" : "gyms"}` : "On save"}
                </span>
                <span className="flex w-16 justify-end">
                  <Toggle
                    ariaLabel={`${term.label} offered to new gyms`}
                    checked={current?.cycleId ? current.isPurchasable : true}
                    disabled={!current?.cycleId || isBusy(term.key)}
                    onChange={(next) =>
                      current?.cycleId
                        ? run(
                            term.key,
                            () => setTermOffered(current.cycleId as string, next),
                            next ? `${term.label} is back on offer.` : `${term.label} hidden from new gyms.`,
                          )
                        : undefined
                    }
                  />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <span className="text-[11px] leading-relaxed text-mute3">
        Repricing never changes what a gym already paid — it applies from their next renewal. Hiding a term stops
        new gyms choosing it; a gym already on it keeps renewing.
      </span>
    </ConfirmedForm>
  );
}

// ─────────────────────────────── Details ────────────────────────────────

function capLabel(value: number | null) {
  return value === null ? "No limit" : value.toLocaleString("en-IN");
}

function DetailsCard({ pkg }: { pkg: SimplePackage }) {
  const [open, setOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { run, isBusy } = useMutation();
  const environment = useAdminEnvironment();
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
          <Button icon={EditIcon} type="button" onClick={() => setOpen(true)} variant="secondary" size="sm">
            Edit
          </Button>
          <Button icon={archived ? RestoreIcon : ArchiveIcon}
            type="button"
            disabled={isBusy("status")}
            onClick={() =>
              archived
                ? run("status", () => setPlanStatus(pkg.id, "active"), `${pkg.name} restored.`)
                : setConfirmArchive(true)
            }
            variant="secondary" size="sm"
          >

            {archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        danger
        title={`Archive ${pkg.name}?`}
        description="Hides this package from new gyms immediately. Existing subscribers and past invoices are unaffected — this can be reversed with Restore."
        confirmLabel="Archive package"
        pending={isBusy("status")}
        requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined}
        onConfirm={() => {
          setConfirmArchive(false);
          run("status", () => setPlanStatus(pkg.id, "archived"), `${pkg.name} archived.`);
        }}
        onCancel={() => setConfirmArchive(false)}
      />

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
      <ConfirmedForm confirmation="Save these package changes? They can affect what gym owners see." action={formAction} className="flex flex-col gap-3.5">
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
          <Button icon={CancelIcon}
            type="button"
            onClick={onClose}
            variant="secondary" size="lg" className="flex-1"
          >
            Cancel
          </Button>
          <Button pending={isPending} icon={ConfirmIcon} type="submit" disabled={isPending} variant="primary" size="lg" className="flex-1">
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </ConfirmedForm>
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
              <Button icon={DeleteIcon}
                type="button"
                aria-label={`Remove ${feature.name}`}
                disabled={isBusy(feature.id)}
                onClick={() => run(feature.id, () => removeFeature(feature.id), `${feature.name} removed.`)}
                variant="ghost" size="sm" iconOnly className="flex-shrink-0"
               />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-mute3">Nothing listed yet.</p>
      )}

      {/* key resets the input after each successful add without a controlled
          value — the list above is the confirmation that it landed. */}
      <ConfirmedForm confirmation="Save these package changes? They can affect what gym owners see." key={pkg.features.length} action={formAction} className="flex flex-wrap gap-2 border-t border-line pt-3">
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
        <Button pending={isPending} icon={AddIcon} type="submit" disabled={isPending} variant="primary" size="lg">
          {isPending ? "Adding…" : "Add"}
        </Button>
      </ConfirmedForm>
    </div>
  );
}

// ──────────────────────── Terms this screen doesn't own ─────────────────

function ExtraTermsCard({ pkg }: { pkg: SimplePackage }) {
  const { run, isBusy } = useMutation();
  const environment = useAdminEnvironment();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const extras = pkg.extraTerms.filter((c) => c.status === "active");
  if (extras.length === 0) return null;

  const confirmCycle = extras.find((c) => c.id === confirmId) ?? null;

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
            <Button pending={isBusy(cycle.id)} icon={ArchiveIcon}
              type="button"
              disabled={isBusy(cycle.id)}
              onClick={() => setConfirmId(cycle.id)}
              variant="secondary" size="sm" className="ml-auto"
            >
              {isBusy(cycle.id) ? "Retiring…" : "Retire"}
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirmCycle !== null}
        danger
        title={confirmCycle ? `Retire ${confirmCycle.billingPeriod}?` : ""}
        description="Gym owners can no longer buy this billing term. Existing subscribers on it are unaffected."
        confirmLabel="Retire term"
        pending={confirmCycle ? isBusy(confirmCycle.id) : false}
        requireTypedConfirmation={environment === "prod" ? "PRODUCTION" : undefined}
        onConfirm={() => {
          if (!confirmCycle) return;
          const cycle = confirmCycle;
          setConfirmId(null);
          run(cycle.id, () => archiveTerm(cycle.id), `${cycle.billingPeriod} retired.`);
        }}
        onCancel={() => setConfirmId(null)}
      />
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
    <ConfirmedForm confirmation="Save these package changes? They can affect what gym owners see." action={formAction} className={CARD}>
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
        <Button pending={isPending} icon={ConfirmIcon} type="submit" disabled={isPending} variant="primary" size="lg">
          {isPending ? "Creating…" : "Create package"}
        </Button>
      </div>
    </ConfirmedForm>
  );
}
