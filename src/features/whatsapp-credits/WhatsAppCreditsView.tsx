"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { SearchBox } from "@/components/SearchBox";
import { Pagination } from "@/components/Pagination";
import { formatMinorWhole, toMinorUnits } from "@/core/money/format";
import { AddIcon, ArchiveIcon, EditIcon, RestoreIcon, WhatsAppIcon } from "@/core/ui/icons";
import {
  createWhatsAppCreditPackage,
  grantWhatsAppCredits,
  setWhatsAppCreditPackageStatus,
  updateWhatsAppCreditPackage,
} from "./actions";
import type { WhatsAppCreditGym, WhatsAppCreditPackage } from "./queries";

const INPUT =
  "w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink disabled:bg-sand disabled:text-mute";
const LABEL = "flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-mute";

function useMutation() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function run(key: string, action: () => Promise<{ error: string | null }>, success: string, after?: () => void) {
    setBusyKey(key);
    startTransition(async () => {
      const result = await action();
      setBusyKey(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  return { run, isPending, busyKey };
}

export function WhatsAppCreditsView({
  packages,
  gyms,
  total,
  page,
  pageSize,
  searchParams,
}: {
  packages: WhatsAppCreditPackage[];
  gyms: WhatsAppCreditGym[];
  total: number;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const mutation = useMutation();
  const [editing, setEditing] = useState<WhatsAppCreditPackage | "new" | null>(null);
  const [granting, setGranting] = useState<WhatsAppCreditGym | null>(null);
  const activePackages = packages.filter((item) => item.status === "active");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">WhatsApp credits</h1>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-mute">
            Manage the packages gyms can buy and add audited credits to any gym. Admin grants are balance
            adjustments; they do not fabricate payment revenue.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="press-scale flex min-h-[40px] items-center gap-2 bg-ink px-4 text-[11px] font-bold uppercase tracking-[0.09em] text-hi"
        >
          <AddIcon size={14} aria-hidden /> New credit package
        </button>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-[18px]">Credit packages</h2>
            <p className="text-[11.5px] text-mute">These prices are read by the gym-owner WhatsApp checkout.</p>
          </div>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-mute">
            {activePackages.length} active · {packages.length - activePackages.length} archived
          </span>
        </div>

        {packages.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {packages.map((pkg) => (
              <article
                key={pkg.id}
                className={`flex flex-col gap-3 border-[1.5px] bg-paper p-4 transition-colors hover:bg-sand/60 ${
                  pkg.status === "archived" ? "border-line opacity-70" : "border-ink"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13.5px]">{pkg.name}</strong>
                    <span className="font-mono text-[10px] text-mute3">{pkg.code}</span>
                  </span>
                  <span className="border border-line px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-mute">
                    {pkg.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-y border-line py-3">
                  <span className="text-[10.5px] text-mute">
                    Credits<strong className="mt-0.5 block text-[17px] text-ink">{pkg.credits.toLocaleString("en-IN")}</strong>
                  </span>
                  <span className="text-right text-[10.5px] text-mute">
                    Price<strong className="mt-0.5 block text-[17px] text-ink">{formatMinorWhole(pkg.priceMinor, pkg.currency)}</strong>
                  </span>
                </div>
                <div className="mt-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(pkg)}
                    className="flex min-h-[34px] flex-1 items-center justify-center gap-1.5 border-[1.5px] border-line text-[10.5px] font-bold"
                  >
                    <EditIcon size={12} aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.run(
                        `status-${pkg.id}`,
                        () => setWhatsAppCreditPackageStatus(pkg.id, pkg.status === "active" ? "archived" : "active"),
                        pkg.status === "active" ? "Credit package archived." : "Credit package restored.",
                      )
                    }
                    className="flex min-h-[34px] flex-1 items-center justify-center gap-1.5 border-[1.5px] border-line text-[10.5px] font-bold disabled:opacity-60"
                  >
                    {pkg.status === "active" ? <ArchiveIcon size={12} aria-hidden /> : <RestoreIcon size={12} aria-hidden />}
                    {mutation.busyKey === `status-${pkg.id}`
                      ? "Saving…"
                      : pkg.status === "active"
                        ? "Archive"
                        : "Restore"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="border-[1.5px] border-dashed border-line bg-paper p-8 text-center text-[12.5px] text-mute">
            No WhatsApp credit packages exist yet. Create one to make it available to gyms.
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t-2 border-ink pt-5">
        <div>
          <h2 className="font-display text-[18px]">Gym balances</h2>
          <p className="text-[11.5px] text-mute">Search by gym name, gym code or city, then add credits from that row.</p>
        </div>
        <SearchBox placeholder="Search gym, code or city" className="max-w-xl" />
        <div className="overflow-x-auto border-[1.5px] border-ink bg-paper">
          <table className="w-full min-w-[760px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="mfd-micro-label border-b border-line px-4 py-2.5">Gym</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5">WhatsApp</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Balance</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Purchased</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Used</th>
                <th className="mfd-micro-label border-b border-line px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {gyms.map((gym) => (
                <tr key={gym.organizationId} className="mfd-table-row transition-colors hover:bg-sand/70">
                  <td className="border-b border-line px-4 py-2.5">
                    <strong className="block text-[12.5px]">{gym.name}</strong>
                    <span className="text-[10.5px] text-mute">{gym.gymCode} · {gym.city}</span>
                  </td>
                  <td className="border-b border-line px-3 py-2.5 text-mute">{gym.integrationStatus}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right font-bold">{gym.balance.toLocaleString("en-IN")}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right text-mute">{gym.purchasedTotal.toLocaleString("en-IN")}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right text-mute">{gym.usedTotal.toLocaleString("en-IN")}</td>
                  <td className="border-b border-line px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => setGranting(gym)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 border-[1.5px] border-ink px-3 text-[10.5px] font-bold"
                    >
                      <AddIcon size={12} aria-hidden /> Add credits
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!gyms.length ? <p className="p-8 text-center text-[12.5px] text-mute">No gyms match this search.</p> : null}
          <Pagination
            pathname="/admin/whatsapp-credits"
            searchParams={searchParams}
            page={page}
            pageSize={pageSize}
            total={total}
            itemLabel="gyms"
          />
        </div>
      </section>

      <PackageSheet packageValue={editing} onClose={() => setEditing(null)} />
      <GrantSheet gym={granting} packages={activePackages} onClose={() => setGranting(null)} />
    </div>
  );
}

function PackageSheet({
  packageValue,
  onClose,
}: {
  packageValue: WhatsAppCreditPackage | "new" | null;
  onClose: () => void;
}) {
  const mutation = useMutation();
  const pkg = packageValue === "new" || packageValue === null ? null : packageValue;
  const [form, setForm] = useState({ code: "", name: "", credits: "", price: "", currency: "INR", sortOrder: "0" });
  const identity = packageValue === "new" ? "new" : (pkg?.id ?? "closed");
  const [lastIdentity, setLastIdentity] = useState(identity);
  if (identity !== lastIdentity) {
    setLastIdentity(identity);
    setForm(
      pkg
        ? {
            code: pkg.code,
            name: pkg.name,
            credits: String(pkg.credits),
            price: (pkg.priceMinor / 100).toFixed(2),
            currency: pkg.currency,
            sortOrder: String(pkg.sortOrder),
          }
        : { code: "", name: "", credits: "", price: "", currency: "INR", sortOrder: "0" },
    );
  }

  function save() {
    const credits = Number(form.credits);
    const priceMinor = toMinorUnits(form.price);
    const sortOrder = Number(form.sortOrder);
    if (!Number.isInteger(credits) || credits <= 0) return mutation.run("noop", async () => ({ error: "Credits must be a positive whole number." }), "");
    if (priceMinor === null || priceMinor <= 0) return mutation.run("noop", async () => ({ error: "Enter a valid positive price." }), "");
    if (!Number.isInteger(sortOrder) || sortOrder < 0) return mutation.run("noop", async () => ({ error: "Sort order must be zero or more." }), "");

    const input = {
      id: pkg?.id,
      code: form.code,
      name: form.name,
      credits,
      priceMinor,
      currency: form.currency,
      sortOrder,
    };
    mutation.run(
      "save-package",
      () => (pkg ? updateWhatsAppCreditPackage(input) : createWhatsAppCreditPackage(input)),
      pkg ? "Credit package updated." : "Credit package created.",
      onClose,
    );
  }

  return (
    <Sheet open={packageValue !== null} onClose={onClose} eyebrow="WhatsApp checkout catalogue" title={pkg ? `Edit ${pkg.name}` : "New credit package"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${LABEL} sm:col-span-2`}>Package code<input value={form.code} disabled={Boolean(pkg)} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="wa_credits_5k" className={INPUT} /></label>
        <label className={`${LABEL} sm:col-span-2`}>Display name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="5,000 credits" className={INPUT} /></label>
        <label className={LABEL}>Credits<input type="number" min="1" step="1" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className={INPUT} /></label>
        <label className={LABEL}>Price<input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="1000" className={INPUT} /></label>
        <label className={LABEL}>Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={10} className={INPUT} /></label>
        <label className={LABEL}>Sort order<input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={INPUT} /></label>
      </div>
      <p className="text-[10.5px] leading-relaxed text-mute3">Existing purchases keep their snapshotted credits and price. Editing this package changes only future checkouts.</p>
      <button type="button" disabled={mutation.isPending} onClick={save} className="flex min-h-[40px] items-center justify-center bg-ink text-[11px] font-bold uppercase tracking-[0.09em] text-hi disabled:opacity-60">
        {mutation.busyKey === "save-package" ? "Saving…" : pkg ? "Save package" : "Create package"}
      </button>
    </Sheet>
  );
}

function GrantSheet({
  gym,
  packages,
  onClose,
}: {
  gym: WhatsAppCreditGym | null;
  packages: WhatsAppCreditPackage[];
  onClose: () => void;
}) {
  const mutation = useMutation();
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [lastGymId, setLastGymId] = useState(gym?.organizationId ?? null);
  if ((gym?.organizationId ?? null) !== lastGymId) {
    setLastGymId(gym?.organizationId ?? null);
    setCredits("");
    setNote("");
  }

  function grant() {
    if (!gym) return;
    const amount = Number(credits);
    mutation.run(
      "grant",
      () => grantWhatsAppCredits(gym.organizationId, amount, note),
      `${amount.toLocaleString("en-IN")} credits added to ${gym.name}.`,
      onClose,
    );
  }

  return (
    <Sheet open={Boolean(gym)} onClose={onClose} eyebrow="Audited balance adjustment" title={`Add credits to ${gym?.name ?? "gym"}`}>
      {gym ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-[1.5px] border-line bg-sand px-3 py-2.5">
            <WhatsAppIcon size={17} aria-hidden />
            <span className="text-[11.5px] text-mute">Current balance<strong className="ml-2 text-[15px] text-ink">{gym.balance.toLocaleString("en-IN")}</strong></span>
          </div>
          {packages.length ? (
            <label className={LABEL}>Quick fill from package<select defaultValue="" onChange={(e) => setCredits(e.target.value)} className={INPUT}><option value="">Custom amount</option>{packages.map((pkg) => <option key={pkg.id} value={pkg.credits}>{pkg.name} · {pkg.credits.toLocaleString("en-IN")}</option>)}</select></label>
          ) : null}
          <label className={LABEL}>Credits to add<input type="number" min="1" max="10000000" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 1000" className={INPUT} /></label>
          <label className={LABEL}>Reason / note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Why this adjustment is being made" className={INPUT} /></label>
          <p className="text-[10.5px] leading-relaxed text-mute3">This adds an adjustment to the credit ledger and admin audit log. It does not create a payment or increase purchased credits.</p>
          <button type="button" disabled={mutation.isPending || !credits} onClick={grant} className="flex min-h-[40px] items-center justify-center gap-1.5 bg-ink text-[11px] font-bold uppercase tracking-[0.09em] text-hi disabled:opacity-60"><AddIcon size={13} aria-hidden />{mutation.busyKey === "grant" ? "Adding…" : "Add credits"}</button>
        </div>
      ) : null}
    </Sheet>
  );
}
