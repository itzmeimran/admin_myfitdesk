"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { Plan, PlanFeature, PlanCycle, PlanOffer } from "@/features/plans/queries";
import {
  createPlan,
  updatePlan,
  setPlanStatus,
  setPlanCaps,
  addPlanFeature,
  updatePlanFeature,
  deletePlanFeature,
  setPlanFeatureEnabled,
  reorderPlanFeatures,
  addPlanCycle,
  updatePlanCycle,
  setPlanCycleStatus,
  setPlanCyclePurchasable,
  reorderPlanCycles,
  addPlanOffer,
  updatePlanOffer,
  setPlanOfferEnabled,
  deletePlanOffer,
  type PlanFormState,
  type PlanFeatureFormState,
  type PlanCycleFormState,
  type PlanOfferFormState,
} from "@/features/plans/actions";
import { Sheet } from "@/components/Sheet";
import { Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { formatMinorWhole } from "@/core/money/format";
import { formatShortDate } from "@/core/dates/format";
import {
  AddIcon,
  EditIcon,
  ArchiveIcon,
  RestoreIcon,
  DeleteIcon,
  ConfirmIcon,
  CancelIcon,
  OfferIcon,
  ToggleOnIcon,
  ToggleOffIcon,
} from "@/core/ui/icons";
import { ICON_SIZE } from "@/core/ui/icon-size";

type StatusFilter = "Active" | "Archived";

/**
 * The dynamic Plans catalogue — additive next to Packages (features/
 * packages/*, untouched). One Sheet per plan (basic info) containing three
 * inline sub-lists (Features / Billing cycles / Offers-per-cycle); Add/Edit
 * on any of the three opens the smaller centered Dialog rather than nesting
 * another Sheet, which is confusing UX for a 2-5 field form. Reorder is
 * move-up/move-down rather than drag-and-drop — same functional outcome,
 * far less machinery, and this app has no drag library anywhere else.
 */
export function PlansView({ plans }: { plans: Plan[] }) {
  const [filter, setFilter] = useState<StatusFilter>("Active");
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  // The plan being edited is looked up by id from the current `plans` prop
  // on every render, rather than snapshotted into state — a feature/cycle/
  // offer mutation calls router.refresh() to re-fetch, and the Sheet needs
  // to pick up that fresh nested data on the same open editing session
  // instead of continuing to show what the list looked like when it opened.
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const editingPlan = editingPlanId ? (plans.find((p) => p.id === editingPlanId) ?? null) : null;
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const visiblePlans = plans.filter((p) => (filter === "Active" ? p.status === "active" : p.status === "archived"));

  function openCreate() {
    setEditingPlanId(null);
    setPlanSheetOpen(true);
  }
  function openEdit(plan: Plan) {
    setEditingPlanId(plan.id);
    setPlanSheetOpen(true);
  }
  function closeSheet() {
    setPlanSheetOpen(false);
    setEditingPlanId(null);
  }

  function handleToggleArchive(plan: Plan) {
    const nextStatus = plan.status === "archived" ? "active" : "archived";
    setArchivingId(plan.id);
    startTransition(async () => {
      const { error } = await setPlanStatus(plan.id, nextStatus);
      setArchivingId(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(nextStatus === "archived" ? `${plan.name} archived.` : `${plan.name} restored.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">Plans</h1>
          <p className="text-[12.5px] text-mute">
            Dynamic plans — any number of tiers, each with its own billing cycles, features and
            offers. Separate from the legacy Packages catalogue; Settings decides which one buyers see.
          </p>
        </div>
        <div className="flex" role="group" aria-label="Status">
          {(["Active", "Archived"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`-ml-[1.5px] flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11.5px] font-bold first:ml-0 ${
                filter === f ? "bg-ink text-hi" : "bg-paper text-ink"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[36px] items-center gap-2 bg-ink px-3.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <AddIcon size={ICON_SIZE.button} aria-hidden />
          New plan
        </button>
      </div>

      {visiblePlans.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 border-[1.5px] border-line px-6 py-10 text-center">
          <span className="font-display text-base">No {filter.toLowerCase()} plans</span>
          <p className="text-[12px] text-mute">
            {filter === "Active" ? "Create a plan to get started." : "Nothing has been archived yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {visiblePlans.map((plan) => {
            const archived = plan.status === "archived";
            const isBusy = isPending && archivingId === plan.id;
            const activeCycles = plan.cycles.filter((c) => c.status === "active");
            const hasLiveOffer = plan.cycles.some((c) => c.offers.some((o) => o.isEnabled));
            const enabledFeatureCount = plan.features.filter((f) => f.isEnabled).length;

            return (
              <div
                key={plan.id}
                className="flex flex-1 flex-col gap-3 border-[1.5px] border-line p-4"
                style={{ flexBasis: 300 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-display text-[16px] tracking-[-0.015em]">{plan.name}</span>
                    <span className="font-mono text-[10.5px] text-mute2">{plan.code}</span>
                  </span>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {hasLiveOffer ? (
                      <span className="flex items-center gap-1 bg-hi px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em] text-on-hi">
                        <OfferIcon size={11} aria-hidden />
                        Offer
                      </span>
                    ) : null}
                    <span
                      className="px-[7px] py-[4px] text-[9.5px] font-bold uppercase tracking-[0.1em]"
                      style={{
                        background: archived ? "var(--sand)" : "var(--hi)",
                        color: archived ? "var(--mute)" : "var(--on-hi)",
                      }}
                    >
                      {archived ? "Archived" : "Active"}
                    </span>
                  </div>
                </div>

                {plan.description ? <p className="text-[12.5px] leading-relaxed text-mute">{plan.description}</p> : null}

                <div className="flex flex-col gap-1 border-t border-line pt-2.5 text-[12.5px]">
                  {activeCycles.length === 0 ? (
                    <span className="text-mute3">No active billing cycles yet</span>
                  ) : (
                    activeCycles.map((c) => {
                      const liveOffer = c.offers.find((o) => o.isEnabled);
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2">
                          <span className="text-mute">{c.billingPeriod}</span>
                          <span className="flex items-baseline gap-1.5">
                            {liveOffer ? (
                              <span className="text-[10.5px] text-mute3 line-through">
                                {formatMinorWhole(c.priceMinor, c.currency)}
                              </span>
                            ) : null}
                            <span className="font-bold">{formatMinorWhole(c.priceMinor, c.currency)}</span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[12.5px]">
                  <span>
                    <span className="font-bold">{plan.gymCount}</span> gyms
                  </span>
                  <span className="text-mute">{formatMinorWhole(plan.mrrMinor, "INR")} MRR</span>
                  <span className="text-mute">{enabledFeatureCount} features</span>
                </div>

                <div className="mt-auto flex gap-2 border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => openEdit(plan)}
                    className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold"
                  >
                    <EditIcon size={13} aria-hidden />
                    Manage
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleArchive(plan)}
                    className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 border-[1.5px] border-line text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                  >
                    {archived ? <RestoreIcon size={13} aria-hidden /> : <ArchiveIcon size={13} aria-hidden />}
                    {isBusy ? "Working…" : archived ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="max-w-2xl text-[11.5px] leading-relaxed text-mute3">
        Archiving a plan hides it from new purchases but never deletes it — existing subscribers and
        past invoices keep referencing the same rows. Caps stay enforced by
        features/billing/limits.ts regardless of which catalogue is live.
      </p>

      <PlanSheet
        open={planSheetOpen}
        onClose={closeSheet}
        editing={editingPlan}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Plan Sheet — basic info + three inline sub-lists.
// ═══════════════════════════════════════════════════════════════════════

const initialPlanState: PlanFormState = { error: null };

function PlanSheet({
  open,
  onClose,
  editing,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  editing: Plan | null;
  onChanged: () => void;
}) {
  const toast = useToast();
  const action = editing ? updatePlan : createPlan;
  const [state, formAction, isSubmitting] = useActionState(action, initialPlanState);
  const [lastHandledState, setLastHandledState] = useState(initialPlanState);

  const [featureDialog, setFeatureDialog] = useState<{ editing: PlanFeature | null } | null>(null);
  const [cycleDialog, setCycleDialog] = useState<{ editing: PlanCycle | null } | null>(null);
  const [offerDialog, setOfferDialog] = useState<{ cycleId: string; editing: PlanOffer | null } | null>(null);
  const [confirmDeleteFeature, setConfirmDeleteFeature] = useState<string | null>(null);
  const [confirmDeleteOffer, setConfirmDeleteOffer] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.error) {
      toast.error(state.error);
    } else if (state !== initialPlanState) {
      toast.success(editing ? "Plan updated." : "Plan created.");
      onChanged();
      if (!editing) onClose();
    }
  }

  if (!open) return null;
  const isEditing = !!editing;

  function runToggle(id: string, fn: () => Promise<{ error: string | null }>, success: string) {
    setBusyId(id);
    startTransition(async () => {
      const { error } = await fn();
      setBusyId(null);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(success);
      onChanged();
    });
  }

  function moveFeature(index: number, direction: -1 | 1) {
    if (!editing) return;
    const ids = editing.features.map((f) => f.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runToggle(ids[index], () => reorderPlanFeatures(editing.id, ids), "Features reordered.");
  }

  function moveCycle(index: number, direction: -1 | 1) {
    if (!editing) return;
    const ids = editing.cycles.map((c) => c.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runToggle(ids[index], () => reorderPlanCycles(editing.id, ids), "Billing cycles reordered.");
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        eyebrow={isEditing ? "Updates one row in plans" : "Writes one row to plans"}
        title={isEditing ? `Manage ${editing?.name}` : "New plan"}
        maxHeightClassName="max-h-[92%]"
      >
        <form action={formAction} className="flex flex-col gap-3.5">
          {isEditing && editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1" style={{ flexBasis: 220, flexGrow: 1 }}>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
                Plan name<span className="text-accent"> *</span>
              </span>
              <input
                type="text"
                name="name"
                defaultValue={editing?.name ?? ""}
                placeholder="Shown to gym owners"
                required
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1" style={{ flexBasis: 150 }}>
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
                  placeholder="business"
                  required
                  className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
                />
              )}
              <span className="text-[10.5px] text-mute3">
                {isEditing ? "Never changes once a plan exists." : "Stable machine name, unique"}
              </span>
            </label>
            <label className="flex flex-col gap-1" style={{ flexBasis: 170 }}>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Purchasable</span>
              <select
                name="isPurchasable"
                defaultValue={editing ? String(editing.isPurchasable) : "true"}
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              >
                <option value="true">Yes — buyable now</option>
                <option value="false">No — visible but not buyable</option>
              </select>
            </label>
            <label className="flex flex-col gap-1" style={{ flexBasis: "100%" }}>
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Description</span>
              <textarea
                name="description"
                defaultValue={editing?.description ?? ""}
                placeholder="One sentence"
                rows={2}
                className="w-full resize-none border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="press-scale flex min-h-[42px] flex-1 items-center justify-center gap-2 border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="press-scale flex min-h-[42px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
            >
              <ConfirmIcon size={ICON_SIZE.button} aria-hidden />
              {isSubmitting ? "Saving…" : isEditing ? "Save basics" : "Create plan"}
            </button>
          </div>
        </form>

        {/* Everything below is intentionally OUTSIDE the basics form above —
            CapsRow renders its own <form> (nested forms are invalid HTML),
            and Features/Billing cycles/Offers act on individual rows via
            plain buttons, not a form submission of their own. */}
        <div className="flex flex-col gap-3.5">
          {isEditing && editing ? (
            <>
              {/* ── Caps ─────────────────────────────────────────────── */}
              <CapsRow plan={editing} onChanged={onChanged} />

              {/* ── Features ─────────────────────────────────────────── */}
              <div className="flex flex-col gap-2 border-t border-line pt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Features</span>
                  <button
                    type="button"
                    onClick={() => setFeatureDialog({ editing: null })}
                    className="press-scale flex min-h-[30px] items-center gap-1.5 border-[1.5px] border-ink px-2.5 text-[10.5px] font-bold"
                  >
                    <AddIcon size={12} aria-hidden />
                    Add feature
                  </button>
                </div>
                {editing.features.length === 0 ? (
                  <p className="border-[1.5px] border-dashed border-line px-3 py-4 text-center text-[11.5px] text-mute3">
                    No features yet — buyers see a plan with no checklist until you add one.
                  </p>
                ) : (
                  <div className="overflow-hidden border-[1.5px] border-line">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="border-b-[1.5px] border-line bg-sand text-left text-[9.5px] font-bold uppercase tracking-[0.1em] text-mute">
                          <th className="px-2.5 py-2">Feature</th>
                          <th className="px-2.5 py-2">Status</th>
                          <th className="px-2.5 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editing.features.map((f, i) => (
                          <tr key={f.id} className="border-b border-line last:border-b-0">
                            <td className="px-2.5 py-2 font-medium text-ink">{f.name}</td>
                            <td className="px-2.5 py-2">
                              <button
                                type="button"
                                disabled={isPending && busyId === f.id}
                                onClick={() =>
                                  runToggle(
                                    f.id,
                                    () => setPlanFeatureEnabled(f.id, !f.isEnabled),
                                    f.isEnabled ? `${f.name} disabled.` : `${f.name} enabled.`,
                                  )
                                }
                                className="flex items-center gap-1.5 text-[11px] font-bold disabled:opacity-50"
                                style={{ color: f.isEnabled ? "var(--ink)" : "var(--mute3)" }}
                              >
                                {f.isEnabled ? <ToggleOnIcon size={16} aria-hidden /> : <ToggleOffIcon size={16} aria-hidden />}
                                {f.isEnabled ? "Enabled" : "Disabled"}
                              </button>
                            </td>
                            <td className="px-2.5 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  disabled={i === 0}
                                  onClick={() => moveFeature(i, -1)}
                                  className="px-1 text-[13px] text-mute disabled:opacity-30"
                                  aria-label="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  disabled={i === editing.features.length - 1}
                                  onClick={() => moveFeature(i, 1)}
                                  className="px-1 text-[13px] text-mute disabled:opacity-30"
                                  aria-label="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFeatureDialog({ editing: f })}
                                  className="px-1.5 text-[11px] font-bold text-accent"
                                >
                                  Edit
                                </button>
                                {confirmDeleteFeature === f.id ? (
                                  <span className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmDeleteFeature(null);
                                        runToggle(f.id, () => deletePlanFeature(f.id), `${f.name} deleted.`);
                                      }}
                                      className="px-1.5 text-[11px] font-bold text-accent"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteFeature(null)}
                                      className="px-1 text-mute"
                                      aria-label="Cancel delete"
                                    >
                                      <CancelIcon size={12} aria-hidden />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteFeature(f.id)}
                                    className="px-1.5 text-mute"
                                    aria-label={`Delete ${f.name}`}
                                  >
                                    <DeleteIcon size={13} aria-hidden />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Billing cycles ───────────────────────────────────── */}
              <div className="flex flex-col gap-2 border-t border-line pt-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Billing cycles</span>
                  <button
                    type="button"
                    onClick={() => setCycleDialog({ editing: null })}
                    className="press-scale flex min-h-[30px] items-center gap-1.5 border-[1.5px] border-ink px-2.5 text-[10.5px] font-bold"
                  >
                    <AddIcon size={12} aria-hidden />
                    Add cycle
                  </button>
                </div>
                {editing.cycles.length === 0 ? (
                  <p className="border-[1.5px] border-dashed border-line px-3 py-4 text-center text-[11.5px] text-mute3">
                    No billing cycles yet — this plan can&apos;t be purchased until it has at least one.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {editing.cycles.map((c, i) => (
                      <div key={c.id} className="flex flex-col gap-2 border-[1.5px] border-line p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[12.5px]">{c.billingPeriod}</span>
                          <span className="text-[12.5px] text-mute">{formatMinorWhole(c.priceMinor, c.currency)}</span>
                          <span
                            className="px-[6px] py-[2px] text-[9px] font-bold uppercase tracking-[0.08em]"
                            style={{
                              background: c.status === "archived" ? "var(--sand)" : "var(--hi)",
                              color: c.status === "archived" ? "var(--mute)" : "var(--on-hi)",
                            }}
                          >
                            {c.status === "archived" ? "Archived" : "Active"}
                          </span>
                          {!c.isPurchasable ? (
                            <span className="px-[6px] py-[2px] text-[9px] font-bold uppercase tracking-[0.08em] text-mute" style={{ background: "var(--sand)" }}>
                              Not purchasable
                            </span>
                          ) : null}
                          <span className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              disabled={i === 0}
                              onClick={() => moveCycle(i, -1)}
                              className="px-1 text-[13px] text-mute disabled:opacity-30"
                              aria-label="Move up"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={i === editing.cycles.length - 1}
                              onClick={() => moveCycle(i, 1)}
                              className="px-1 text-[13px] text-mute disabled:opacity-30"
                              aria-label="Move down"
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => setCycleDialog({ editing: c })}
                              className="px-1.5 text-[11px] font-bold text-accent"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={isPending && busyId === c.id}
                              onClick={() =>
                                runToggle(
                                  c.id,
                                  () => setPlanCyclePurchasable(c.id, !c.isPurchasable),
                                  c.isPurchasable ? "Hidden from checkout." : "Made purchasable.",
                                )
                              }
                              className="px-1.5 text-[11px] font-bold"
                            >
                              {c.isPurchasable ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              disabled={isPending && busyId === c.id}
                              onClick={() =>
                                runToggle(
                                  c.id,
                                  () => setPlanCycleStatus(c.id, c.status === "archived" ? "active" : "archived"),
                                  c.status === "archived" ? "Cycle restored." : "Cycle archived.",
                                )
                              }
                              className="px-1.5 text-[11px] font-bold"
                            >
                              {c.status === "archived" ? "Restore" : "Archive"}
                            </button>
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 pl-0.5">
                          {c.offers.length === 0 ? (
                            <span className="text-[11px] text-mute3">No offer on this cycle.</span>
                          ) : (
                            c.offers.map((o) => (
                              <div key={o.id} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                                <OfferIcon size={12} className="text-mute" aria-hidden />
                                <span className={o.isEnabled ? "font-bold" : "text-mute3 line-through"}>
                                  {o.discountType === "percent" ? `${o.discountValue}% off` : `${formatMinorWhole(o.discountValue, c.currency)} off`}
                                </span>
                                {o.expiresAt ? (
                                  <span className="text-mute3">until {formatShortDate(new Date(o.expiresAt))}</span>
                                ) : null}
                                <span className="ml-auto flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setOfferDialog({ cycleId: c.id, editing: o })}
                                    className="text-[11px] font-bold text-accent"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending && busyId === o.id}
                                    onClick={() =>
                                      runToggle(
                                        o.id,
                                        () => setPlanOfferEnabled(o.id, !o.isEnabled),
                                        o.isEnabled ? "Offer disabled." : "Offer enabled.",
                                      )
                                    }
                                    className="text-[11px] font-bold"
                                  >
                                    {o.isEnabled ? "Disable" : "Enable"}
                                  </button>
                                  {confirmDeleteOffer === o.id ? (
                                    <span className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setConfirmDeleteOffer(null);
                                          runToggle(o.id, () => deletePlanOffer(o.id), "Offer deleted.");
                                        }}
                                        className="text-[11px] font-bold text-accent"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteOffer(null)}
                                        className="text-mute"
                                        aria-label="Cancel delete"
                                      >
                                        <CancelIcon size={12} aria-hidden />
                                      </button>
                                    </span>
                                  ) : o.isEnabled ? (
                                    <span className="text-[11px] text-mute3" title="Disable this offer before deleting it.">
                                      —
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteOffer(o.id)}
                                      className="text-mute"
                                      aria-label="Delete offer"
                                    >
                                      <DeleteIcon size={12} aria-hidden />
                                    </button>
                                  )}
                                </span>
                              </div>
                            ))
                          )}
                          {c.status === "active" ? (
                            <button
                              type="button"
                              onClick={() => setOfferDialog({ cycleId: c.id, editing: null })}
                              className="press-scale flex w-fit items-center gap-1 text-[11px] font-bold text-accent"
                            >
                              <AddIcon size={11} aria-hidden />
                              Add offer
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="border-t border-line pt-3 text-[11.5px] leading-relaxed text-mute">
              Save the plan first — features, billing cycles and offers are added from here once it
              exists.
            </p>
          )}
        </div>
      </Sheet>

      {editing ? (
        <>
          <FeatureDialog
            planId={editing.id}
            state={featureDialog}
            onClose={() => setFeatureDialog(null)}
            onSaved={() => {
              setFeatureDialog(null);
              onChanged();
            }}
          />
          <CycleDialog
            planId={editing.id}
            state={cycleDialog}
            onClose={() => setCycleDialog(null)}
            onSaved={() => {
              setCycleDialog(null);
              onChanged();
            }}
          />
          <OfferDialog
            state={offerDialog}
            onClose={() => setOfferDialog(null)}
            onSaved={() => {
              setOfferDialog(null);
              onChanged();
            }}
          />
        </>
      ) : null}
    </>
  );
}

function CapsRow({ plan, onChanged }: { plan: Plan; onChanged: () => void }) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const activeCycle = plan.cycles.find((c) => c.status === "active");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const { error } = await setPlanCaps(
        plan.id,
        String(formData.get("maxBranches") ?? ""),
        String(formData.get("maxMembers") ?? ""),
        String(formData.get("maxStaff") ?? ""),
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Caps updated across every active billing cycle.");
      onChanged();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-line pt-3.5">
      <span className="w-full text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
        Caps (applies to every active billing cycle)
      </span>
      <label className="flex flex-col gap-1" style={{ flexBasis: 130 }}>
        <span className="text-[10px] text-mute3">Max branches</span>
        <input
          type="number"
          name="maxBranches"
          min="1"
          defaultValue={activeCycle?.maxBranches ?? ""}
          placeholder="Unlimited"
          className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      <label className="flex flex-col gap-1" style={{ flexBasis: 130 }}>
        <span className="text-[10px] text-mute3">Max members</span>
        <input
          type="number"
          name="maxMembers"
          min="1"
          defaultValue={activeCycle?.maxMembers ?? ""}
          placeholder="Unlimited"
          className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      <label className="flex flex-col gap-1" style={{ flexBasis: 130 }}>
        <span className="text-[10px] text-mute3">Max staff</span>
        <input
          type="number"
          name="maxStaff"
          min="1"
          defaultValue={activeCycle?.maxStaff ?? ""}
          placeholder="Unlimited"
          className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="press-scale flex min-h-[36px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save caps"}
      </button>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Feature / Cycle / Offer dialogs
// ═══════════════════════════════════════════════════════════════════════

const initialFeatureState: PlanFeatureFormState = { error: null };

function FeatureDialog({
  planId,
  state: dialogState,
  onClose,
  onSaved,
}: {
  planId: string;
  state: { editing: PlanFeature | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = dialogState?.editing ?? null;
  const action = editing ? updatePlanFeature : addPlanFeature;
  const [state, formAction, isPending] = useActionState(action, initialFeatureState);
  const [lastHandled, setLastHandled] = useState(initialFeatureState);

  if (state !== lastHandled) {
    setLastHandled(state);
    if (state.error) toast.error(state.error);
    else if (state !== initialFeatureState) {
      toast.success(editing ? "Feature updated." : "Feature added.");
      onSaved();
    }
  }

  if (!dialogState) return null;

  return (
    <Dialog open={!!dialogState} onClose={onClose} eyebrow="plan_features" title={editing ? "Edit feature" : "Add feature"}>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="planId" value={planId} />
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        {editing ? <input type="hidden" name="isEnabled" value={String(editing.isEnabled)} /> : null}
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            Feature name<span className="text-accent"> *</span>
          </span>
          <input
            type="text"
            name="name"
            defaultValue={editing?.name ?? ""}
            placeholder="e.g. WhatsApp notifications"
            required
            autoFocus
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Description (optional)</span>
          <input
            type="text"
            name="description"
            defaultValue={editing?.description ?? ""}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const initialCycleState: PlanCycleFormState = { error: null };

function CycleDialog({
  planId,
  state: dialogState,
  onClose,
  onSaved,
}: {
  planId: string;
  state: { editing: PlanCycle | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = dialogState?.editing ?? null;
  const action = editing ? updatePlanCycle : addPlanCycle;
  const [state, formAction, isPending] = useActionState(action, initialCycleState);
  const [lastHandled, setLastHandled] = useState(initialCycleState);

  if (state !== lastHandled) {
    setLastHandled(state);
    if (state.error) toast.error(state.error);
    else if (state !== initialCycleState) {
      toast.success(editing ? "Billing cycle updated." : "Billing cycle added.");
      onSaved();
    }
  }

  if (!dialogState) return null;

  return (
    <Dialog
      open={!!dialogState}
      onClose={onClose}
      eyebrow="platform_packages (plan-owned)"
      title={editing ? "Edit billing cycle" : "Add billing cycle"}
    >
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="planId" value={planId} />
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        {!editing ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
                Code<span className="text-accent"> *</span>
              </span>
              <input
                type="text"
                name="code"
                placeholder="business_quarterly"
                required
                autoFocus
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
                Billing period label<span className="text-accent"> *</span>
              </span>
              <input
                type="text"
                name="billingPeriod"
                placeholder="Quarterly"
                required
                className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
              />
              <span className="text-[10.5px] text-mute3">Any label — Monthly, Quarterly, Annual, whatever you like.</span>
            </label>
          </>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            Price (₹)<span className="text-accent"> *</span>
          </span>
          <input
            type="number"
            name="price"
            min="0"
            step="1"
            defaultValue={editing ? String(editing.priceMinor / 100) : ""}
            placeholder="1299"
            required
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
            Duration (days)<span className="text-accent"> *</span>
          </span>
          <input
            type="number"
            name="durationDays"
            min="1"
            step="1"
            defaultValue={editing ? String(editing.durationDays) : "90"}
            required
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1" style={{ flexBasis: 120 }}>
            <span className="text-[10px] text-mute3">Max branches</span>
            <input
              type="number"
              name="maxBranches"
              min="1"
              defaultValue={editing?.maxBranches ?? ""}
              placeholder="Unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1" style={{ flexBasis: 120 }}>
            <span className="text-[10px] text-mute3">Max members</span>
            <input
              type="number"
              name="maxMembers"
              min="1"
              defaultValue={editing?.maxMembers ?? ""}
              placeholder="Unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1" style={{ flexBasis: 120 }}>
            <span className="text-[10px] text-mute3">Max staff</span>
            <input
              type="number"
              name="maxStaff"
              min="1"
              defaultValue={editing?.maxStaff ?? ""}
              placeholder="Unlimited"
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
        </div>
        {editing ? (
          <p className="text-[11px] leading-relaxed text-mute3">
            Code and billing period label can&apos;t change once created — add a new cycle instead.
            Existing subscribers on this cycle keep their agreed price; only new charges use the
            updated amount.
          </p>
        ) : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const initialOfferState: PlanOfferFormState = { error: null };

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function OfferDialog({
  state: dialogState,
  onClose,
  onSaved,
}: {
  state: { cycleId: string; editing: PlanOffer | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editing = dialogState?.editing ?? null;
  const action = editing ? updatePlanOffer : addPlanOffer;
  const [state, formAction, isPending] = useActionState(action, initialOfferState);
  const [lastHandled, setLastHandled] = useState(initialOfferState);

  if (state !== lastHandled) {
    setLastHandled(state);
    if (state.error) toast.error(state.error);
    else if (state !== initialOfferState) {
      toast.success(editing ? "Offer updated." : "Offer added.");
      onSaved();
    }
  }

  if (!dialogState) return null;

  return (
    <Dialog open={!!dialogState} onClose={onClose} eyebrow="plan_offers" title={editing ? "Edit offer" : "Add offer"}>
      <form action={formAction} className="flex flex-col gap-3">
        {!editing ? <input type="hidden" name="cycleId" value={dialogState.cycleId} /> : null}
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Discount type</span>
            <select
              name="discountType"
              defaultValue={editing?.discountType ?? "percent"}
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            >
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">
              Amount<span className="text-accent"> *</span>
            </span>
            <input
              type="number"
              name="discountValue"
              min="0.01"
              step="0.01"
              defaultValue={editing?.discountValue ?? ""}
              placeholder="20"
              required
              autoFocus
              className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Starts (optional)</span>
          <input
            type="datetime-local"
            name="startsAt"
            defaultValue={toDatetimeLocal(editing?.startsAt ?? null)}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
          <span className="text-[10.5px] text-mute3">Blank = active immediately</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-mute">Expires (optional)</span>
          <input
            type="datetime-local"
            name="expiresAt"
            defaultValue={toDatetimeLocal(editing?.expiresAt ?? null)}
            className="w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink"
          />
          <span className="text-[10.5px] text-mute3">Blank = never expires</span>
        </label>
        <p className="text-[11px] leading-relaxed text-mute3">
          The payable amount is always computed on the server at checkout (plan_effective_price) —
          this never changes what an already-paid invoice cost.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center border-[1.5px] border-line bg-paper text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="press-scale flex min-h-[40px] flex-1 items-center justify-center gap-2 bg-hi text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink disabled:cursor-wait disabled:opacity-70"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
