"use client";

import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { CreditPackageCatalog } from "./CreditPackageCatalog";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { SearchBox } from "@/components/SearchBox";
import { Pagination } from "@/components/Pagination";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { formatMinor, toMinorUnits } from "@/core/money/format";
import { AddIcon, SettingsIcon, WhatsAppIcon } from "@/core/ui/icons";
import {
  createWhatsAppCreditPackage,
  grantWhatsAppCredits,
  setWhatsAppMetaCostRate,
  setWhatsAppCreditPackageStatus,
  updateWhatsAppCreditPackage,
} from "./actions";
import type {
  WhatsAppCreditGym,
  WhatsAppCreditPackage,
  WhatsAppMetaCategory,
  WhatsAppProfitability,
} from "./queries";

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
  profitability,
}: {
  packages: WhatsAppCreditPackage[];
  gyms: WhatsAppCreditGym[];
  total: number;
  page: number;
  pageSize: number;
  searchParams: Record<string, string | string[] | undefined>;
  profitability: WhatsAppProfitability;
}) {
  const mutation = useMutation();
  const [editing, setEditing] = useState<WhatsAppCreditPackage | "new" | null>(null);
  const [granting, setGranting] = useState<WhatsAppCreditGym | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
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

      <section className="flex flex-col gap-3 border-t-2 border-ink pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px]">WhatsApp usage &amp; profitability</h2>
            <p className="mt-0.5 max-w-3xl text-[11.5px] leading-relaxed text-mute">
              Recharge income versus estimated Meta cost for MyFitDesk-managed sends. A gym&apos;s own WABA usage is
              shown separately because that Meta bill belongs to the gym.
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
            <div className="w-full min-w-0 sm:w-auto [&>div]:w-full [&_input]:min-w-0 [&_input]:flex-1 sm:[&_input]:flex-initial">
              <DateRangeFilter />
            </div>
            <Button icon={SettingsIcon}
              type="button"
              onClick={() => setRatesOpen(true)}
              variant="secondary" size="lg" className="w-full sm:w-auto"
            >
               Meta rates
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <EconomicsTile
            label="Recharge income"
            value={formatMinor(profitability.rechargeIncomeMinor, profitability.currency)}
            detail={`${profitability.rechargeCount.toLocaleString("en-IN")} successful recharges`}
            emphasis
          />
          <EconomicsTile
            label="Estimated Meta cost"
            value={formatMinor(profitability.estimatedMetaCostMinor, profitability.currency)}
            detail={`${profitability.managedMessages.toLocaleString("en-IN")} managed sends`}
          />
          <EconomicsTile
            label="Estimated gross margin"
            value={formatMinor(profitability.grossMarginMinor, profitability.currency)}
            detail={profitability.marginPercent === null ? "No recharge income in range" : `${profitability.marginPercent.toFixed(1)}% margin`}
            accent={profitability.grossMarginMinor < 0}
          />
          <EconomicsTile
            label="Credits sold"
            value={profitability.creditsSold.toLocaleString("en-IN")}
            detail="From successful recharges"
          />
          <EconomicsTile
            label="Credits consumed"
            value={profitability.creditsUsed.toLocaleString("en-IN")}
            detail={`${profitability.creditChargeEvents.toLocaleString("en-IN")} charged sends`}
          />
          <EconomicsTile
            label="Own WABA sends"
            value={profitability.ownWabaMessages.toLocaleString("en-IN")}
            detail="Excluded from your Meta cost"
          />
        </div>

        {profitability.unpricedMessages > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-[1.5px] border-hi bg-hi/15 px-3 py-2.5 text-[11.5px] text-ink">
            <span>
              <strong>{profitability.unpricedMessages.toLocaleString("en-IN")} managed messages</strong> have no
              effective Meta rate, so the cost and margin shown above are understated.
            </span>
            <Button tone="danger" type="button" onClick={() => setRatesOpen(true)} variant="link" size="custom" className="underline underline-offset-2">
              Configure rates
            </Button>
          </div>
        ) : null}

        <div className="overflow-x-auto border-[1.5px] border-line bg-paper">
          <table className="w-full min-w-[680px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left">
                <th className="mfd-micro-label border-b border-line px-3 py-2.5">Category</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Current Meta rate</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Managed sends</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Delivered / read</th>
                <th className="mfd-micro-label border-b border-line px-3 py-2.5 text-right">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {profitability.categories.map((row) => (
                <tr key={row.category} className="mfd-table-row">
                  <td className="border-b border-line px-3 py-2.5 font-bold capitalize">{row.category}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right">
                    {row.currentRateMinor === null ? (
                      <Button tone="danger" type="button" onClick={() => setRatesOpen(true)} variant="link" size="custom" className="underline underline-offset-2">Not set</Button>
                    ) : (
                      <><strong>{formatMetaRate(row.currentRateMinor, profitability.currency)}</strong><span className="block text-[10px] text-mute">per accepted message</span></>
                    )}
                  </td>
                  <td className="border-b border-line px-3 py-2.5 text-right">{row.messages.toLocaleString("en-IN")}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right text-mute">{row.delivered.toLocaleString("en-IN")}</td>
                  <td className="border-b border-line px-3 py-2.5 text-right font-bold">{formatMinor(row.estimatedCostMinor, profitability.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10.5px] leading-relaxed text-mute3">
          Meta payable is an estimate: the Cloud API records message lifecycle data, not invoice amounts. Rates are
          effective-dated, and historical sends keep using the rate that applied when they were sent. Reconcile the
          final amount against Meta&apos;s invoice before accounting close.
        </p>
      </section>

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
          <p className="text-[11.5px] text-mute">Search by gym name, gym code or city, then add credits from that row.</p>
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
      <MetaRatesSheet open={ratesOpen} profitability={profitability} onClose={() => setRatesOpen(false)} />
    </div>
  );
}

function EconomicsTile({ label, value, detail, emphasis, accent }: { label: string; value: string; detail: string; emphasis?: boolean; accent?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 border-[1.5px] p-3.5 ${emphasis ? "border-ink bg-ink text-paper" : "border-line bg-paper"}`}>
      <span className={`text-[9.5px] font-bold uppercase tracking-[0.1em] ${emphasis ? "text-mute3" : "text-mute"}`}>{label}</span>
      <strong className={`break-words font-display text-[20px] tracking-[-0.02em] ${accent ? "text-accent" : emphasis ? "text-hi" : "text-ink"}`}>{value}</strong>
      <span className={`text-[10.5px] ${emphasis ? "text-mute3" : "text-mute"}`}>{detail}</span>
    </div>
  );
}

function formatMetaRate(minor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(minor / 100);
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
      <Button type="button" disabled={mutation.isPending} pending={mutation.busyKey === "save-package"} pendingLabel="Saving…" onClick={save} variant="primary" size="lg" className="w-full">
        {pkg ? "Save package" : "Create package"}
      </Button>
    </Sheet>
  );
}

function MetaRatesSheet({
  open,
  profitability,
  onClose,
}: {
  open: boolean;
  profitability: WhatsAppProfitability;
  onClose: () => void;
}) {
  const mutation = useMutation();
  const categories: WhatsAppMetaCategory[] = ["utility", "marketing", "authentication"];
  const [rates, setRates] = useState<Record<WhatsAppMetaCategory, string>>({ utility: "", marketing: "", authentication: "" });
  const [effectiveDate, setEffectiveDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRates({ utility: "", marketing: "", authentication: "" });
      setEffectiveDate(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()));
    }
  }

  function save() {
    const valid: Array<{ category: WhatsAppMetaCategory; costMinor: number }> = [];
    let validationError: string | null = null;
    for (const category of categories) {
      const raw = rates[category].trim();
      if (!raw) continue;
      if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
        validationError = `${category}: use up to four decimal places.`;
        break;
      }
      const costMinor = Number(raw) * 100;
      if (!Number.isFinite(costMinor) || costMinor <= 0) {
        validationError = `${category}: rate must be greater than zero.`;
        break;
      }
      valid.push({ category, costMinor });
    }
    if (validationError) {
      mutation.run("rate-validation", async () => ({ error: validationError }), "");
      return;
    }
    if (!valid.length) {
      mutation.run("rate-validation", async () => ({ error: "Enter at least one Meta rate to update." }), "");
      return;
    }
    const effectiveFrom = new Date(`${effectiveDate}T00:00:00+05:30`).toISOString();
    mutation.run(
      "save-rates",
      async () => {
        for (const item of valid) {
          const result = await setWhatsAppMetaCostRate(item.category, item.costMinor, profitability.currency, effectiveFrom);
          if (result.error) return result;
        }
        return { error: null };
      },
      `${valid.length} Meta ${valid.length === 1 ? "rate" : "rates"} added.`,
      onClose,
    );
  }

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Effective-dated cost model" title="Update Meta rates">
      <div className="flex flex-col gap-4">
        <p className="text-[11.5px] leading-relaxed text-mute">
          Enter the amount Meta charges MyFitDesk for one accepted managed-sender message. Leave a category blank to
          keep its current rate. New rates do not rewrite historical estimates.
        </p>
        <label className={LABEL}>
          Effective from
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={INPUT} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {categories.map((category) => {
            const current = profitability.categories.find((row) => row.category === category)?.currentRateMinor ?? null;
            return (
              <label key={category} className={LABEL}>
                <span className="capitalize">{category}</span>
                <input
                  inputMode="decimal"
                  value={rates[category]}
                  onChange={(e) => setRates({ ...rates, [category]: e.target.value })}
                  placeholder={current === null ? `Amount in ${profitability.currency}` : `Current ${formatMetaRate(current, profitability.currency)}`}
                  className={INPUT}
                />
              </label>
            );
          })}
        </div>
        <p className="text-[10.5px] leading-relaxed text-mute3">
          Use the per-message amount from Meta&apos;s current India rate card or your invoice allocation. Taxes and
          foreign-exchange differences may make the final invoice vary from this estimate.
        </p>
        <Button type="button" disabled={mutation.isPending || !effectiveDate} pending={mutation.busyKey === "save-rates"} pendingLabel="Saving rates…" onClick={save} variant="primary" size="lg" className="w-full">
          Save effective rates
        </Button>
      </div>
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
