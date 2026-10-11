"use client";

import { useActionConfirmation } from '@/components/ActionConfirmationProvider';
import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { CreditPackageCatalog } from "./CreditPackageCatalog";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { SearchBox } from "@/components/SearchBox";
import { Pagination } from "@/components/Pagination";
import { toMinorUnits } from "@/core/money/format";
import { AddIcon, WhatsAppIcon } from "@/core/ui/icons";
import {
  createWhatsAppCreditPackage,
  grantWhatsAppCredits,
  setWhatsAppCreditPackageStatus,
  updateWhatsAppCreditPackage,
} from "./actions";
import type {
  WhatsAppCreditGym,
  WhatsAppCreditPackage,
} from "./queries";
import { MetaSpendingView } from "./MetaSpendingView";
import type { MetaSpendReport } from "./meta-spend-logic";
import { ConfirmIcon } from '@/core/ui/icons';


const INPUT =
  "w-full border-[1.5px] border-line bg-paper px-2.5 py-2 text-[13px] text-ink outline-none focus:border-ink disabled:bg-sand disabled:text-mute";
const LABEL = "flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-mute";

function useMutation() {
  const router = useRouter(); const toast = useToast(); const confirmAction = useActionConfirmation();
  const [isPending, setPending] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  function run(key: string, action: () => Promise<{ error: string | null }>, success: string, after?: () => void) {
    void confirmAction({title:'Are you sure?',description:"Apply this change to WhatsApp credits or packages? Review the entered values before continuing."}, async () => {
      setBusyKey(key); setPending(true);
      try {
        const result = await action();
        if (result.error) { toast.error(result.error); return; }
        toast.success(success); after?.(); router.refresh();
      } finally { setBusyKey(null); setPending(false); }
    });
  }
  return {run,isPending, busyKey};
}

export function WhatsAppCreditsView({
  packages,
  gyms,
  total,
  page,
  pageSize,
  searchParams,
  spending,
}: {
  packages: WhatsAppCreditPackage[];
  gyms: WhatsAppCreditGym[];
  total: number;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | string[] | undefined>;
  spending: MetaSpendReport;
}) {
  const mutation = useMutation();
  const [editing, setEditing] = useState<WhatsAppCreditPackage | "new" | null>(null);
  const [granting, setGranting] = useState<WhatsAppCreditGym | null>(null);
  const activePackages = packages.filter((item) => item.status === "active");

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] tracking-[-0.02em] md:text-[26px]">WhatsApp credits</h1>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-mute">
            Manage the packages gyms can buy and add audited credits to any gym. Admin grants are balance
            adjustments; they do not fabricate payment revenue.
          </p>
        </div>
      </div>

      <MetaSpendingView report={spending} />

      <CreditPackageCatalog
        packages={packages}
        onEdit={setEditing}
        pending={mutation.isPending}
        busyKey={mutation.busyKey}
        onStatusChange={(pkg) =>
          mutation.run(
            `status-${pkg.id}`,
            () => setWhatsAppCreditPackageStatus(pkg.id, pkg.status === "active" ? "archived" : "active"),
            pkg.status === "active" ? "Credit package archived." : "Credit package restored.",
          )
        }
      />

      <section className="flex flex-col gap-3 border-t-2 border-ink pt-5">
        <div>
          <h2 className="font-display text-[18px]">Gym balances</h2>
          <p className="text-[11.5px] text-mute">Current balances and lifetime purchased / used credits, after failed-send refunds. These are MyFitDesk credits, separate from Meta charges.</p>
        </div>
        <SearchBox placeholder="Search gym, code or city" className="max-w-xl" />
        <div className="min-w-0 border-[1.5px] border-ink bg-paper">
          <div className="divide-y divide-line md:hidden">
            {gyms.map((gym) => (
              <article key={gym.organizationId} className="flex min-w-0 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="break-words text-[14px] font-bold">{gym.name}</h3>
                  <p className="mt-0.5 break-words text-[11.5px] text-mute">{gym.gymCode} · {gym.city}</p>
                  <p className="mt-1 text-[11.5px] text-mute">WhatsApp · {gym.integrationStatus}</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 border-y border-line py-3">
                  {[{ label: "Balance", value: gym.balance }, { label: "Purchased", value: gym.purchasedTotal }, { label: "Used", value: gym.usedTotal }].map((item) => (
                    <div key={item.label} className="min-w-0">
                      <dt className="text-[10px] text-mute">{item.label}</dt>
                      <dd className="mt-1 break-all text-[16px] font-bold">{item.value.toLocaleString("en-IN")}</dd>
                    </div>
                  ))}
                </dl>
                <Button icon={AddIcon} variant="secondary" size="lg" className="w-full" onClick={() => setGranting(gym)}>Add credits</Button>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
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
                      <Button icon={AddIcon}
                        type="button"
                        onClick={() => setGranting(gym)}
                        variant="secondary" size="sm"
                      >
                         Add credits
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <Button icon={ConfirmIcon} type="button" disabled={mutation.isPending} pending={mutation.busyKey === "save-package"} pendingLabel="Saving…" onClick={save} variant="primary" size="lg" className="w-full">
        {pkg ? "Save package" : "Create package"}
      </Button>
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
            <div className={LABEL}>
              <span>Quick fill from package</span>
              <Dropdown
                ariaLabel="Quick fill from package"
                value={packages.some((pkg) => String(pkg.credits) === credits) ? credits : ""}
                options={[{ value: "", label: "Custom amount" }, ...packages.map((pkg) => ({ value: String(pkg.credits), label: `${pkg.name} · ${pkg.credits.toLocaleString("en-IN")}` }))]}
                onChange={setCredits}
                className="w-full"
              />
            </div>
          ) : null}
          <label className={LABEL}>Credits to add<input type="number" min="1" max="10000000" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 1000" className={INPUT} /></label>
          <label className={LABEL}>Reason / note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Why this adjustment is being made" className={INPUT} /></label>
          <p className="text-[10.5px] leading-relaxed text-mute3">This adds an adjustment to the credit ledger and admin audit log. It does not create a payment or increase purchased credits.</p>
          <Button icon={AddIcon} type="button" disabled={mutation.isPending || !credits} pending={mutation.busyKey === "grant"} pendingLabel="Adding…" onClick={grant} variant="primary" size="lg" className="w-full">Add credits</Button>
        </div>
      ) : null}
    </Sheet>
  );
}
