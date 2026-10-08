"use client";

import { TabsLayout, TabsNav } from "@/components/Tabs";

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Button } from "@/components/Button";
import { Dropdown } from "@/components/Dropdown";
import { SkeletonBlock } from "@/components/Skeleton";
import { LuColumns3, LuLock } from "react-icons/lu";
import { ROLE_CONFIG, SCOPE_LABEL } from "@/features/sales/model";
import { SalesCrmProvider, useSalesCrm, type SalesInitial } from "@/features/sales/use-sales-crm";
import { useVisibleLeads } from "@/features/sales/use-visible-leads";
import { Segmented } from "./crm-ui";
import { AnalyticsView } from "./analytics-view";
import { AttentionView } from "./attention-view";
import { CoverageView } from "./coverage-view";
import { LeadDrawer } from "./lead-drawer";
import { ActivityModal, DemoModal, FiltersModal, MoreModal, StagesModal } from "./modals-basic";
import { ConvertModal, DuplicateModal, LostModal, ReassignModal } from "./modals-flows";
import { CreateLeadModal } from './create-lead-modal';
import { PipelineView } from "./pipeline-view";
import { AddIcon, CancelIcon, CopyIcon, LoadMoreIcon, RetryIcon } from '@/core/ui/icons';

export type SalesView = "board" | "attn" | "cov" | "ana";

const TITLES: Record<SalesView, string> = { board: "Sales pipeline", attn: "Needs attention", cov: "Gym coverage", ana: "Sales analytics" };

/** Live CRM. Views are linkable and preserve the current filters and scope. */
export function SalesCrm({ view, initial }: { view: SalesView; initial: SalesInitial }) {
  return <SalesCrmProvider key={`${initial.environment}:${initial.meId}:${initial.role}`} initial={initial} attentionView={view === "attn"}><Screen view={view} /></SalesCrmProvider>;
}

function Screen({ view }: { view: SalesView }) {
  const crm = useSalesCrm();
  const linkedLead = useSearchParams().get('lead');
  const openedLink = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedLead) { openedLink.current = null; return; }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkedLead) && openedLink.current !== linkedLead) {
      openedLink.current = linkedLead;
      crm.openLead(linkedLead);
    }
  }, [linkedLead, crm]);
  const { scope, team } = useVisibleLeads();
  const cfg = ROLE_CONFIG[crm.role];
  const scopeLabel = SCOPE_LABEL[scope] + (scope === "team" ? ` · ${team}` : "");
  const leadView = view === "board" || view === "attn";
  const sub: Record<SalesView, string> = {
    board: `${scopeLabel} · ${crm.total} matching leads`,
    attn: `${scopeLabel} · ${crm.attentionCount} leads need action`,
    cov: `${scopeLabel} · identified gyms are CRM leads`,
    ana: `${scopeLabel} · live sales activity`,
  };
  const tabs: { key: SalesView; label: string; badge?: number }[] = [
    { key: "board", label: "Pipeline" },
    { key: "attn", label: "Needs attention", badge: crm.attentionCount },
    { key: "cov", label: "Coverage" },
    { key: "ana", label: "Analytics" },
  ];

  return (
    <TabsLayout
      className="min-w-0"
      nav={
        <TabsNav
          ariaLabel="Sales views"
          activeKey={view}
          items={tabs.map((t) => ({
            key: t.key,
            label: t.label,
            badge: t.badge,
            href: t.key === "board" ? "/admin/sales" : `/admin/sales?view=${t.key}`,
            scroll: false,
          }))}
        />
      }
    >

      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[22px] tracking-[-0.025em] md:text-[26px]">{TITLES[view]}</h1>
          <p className="text-[12.5px] text-mute">{sub[view]}</p>
        </div>
        {cfg.scopes.length > 1 ? (
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <Segmented ariaLabel="Lead visibility" value={scope} onChange={crm.setScope} size="md" className="flex-1 md:flex-none" options={cfg.scopes.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} />
            {crm.role === "admin" && scope === "team" ? (
              <div className="w-[140px]"><Dropdown ariaLabel="Team" size="sm" value={team} onChange={crm.setTeam} options={Array.from(new Set(Object.values(crm.users).map(u => u.team).filter((t): t is string => !!t))).map(t => ({value:t,label:`${t} team`}))} /></div>
            ) : null}
          </div>
        ) : null}
        {cfg.scopes.length === 1 ? (
          <span className="flex min-h-[36px] items-center gap-2 border-[1.5px] border-line px-3 text-[12px] text-mute">
            <LuLock size={14} aria-hidden /><b className="text-ink">My leads</b> · only leads assigned to you
          </span>
        ) : null}
        {crm.canManageSales?<Button icon={AddIcon} variant="primary" disabled={crm.busy} onClick={()=>crm.openModal({kind:'create'})}>Add lead</Button>:null}
      </div>

      {crm.dataState === "loading" ? <BoardSkeleton /> : null}
      {leadView && crm.dataState === "empty" ? <EmptyLeads /> : null}
      {crm.dataState === "error" ? <LoadError onRetry={crm.retry} /> : null}
      {view === "board" && crm.dataState === "data" ? <PipelineView /> : null}
      {view === "attn" && crm.dataState === "data" ? <AttentionView /> : null}
      {view === "cov" && crm.dataState !== "error" && crm.dataState !== "loading" ? <CoverageView root={crm.coverage} /> : null}
      {view === "ana" && crm.dataState !== "error" && crm.dataState !== "loading" ? <AnalyticsView data={crm.analytics} /> : null}

      {leadView && crm.hasMore ? <Button icon={LoadMoreIcon} disabled={crm.busy} onClick={crm.loadMore} variant="secondary">Load more leads ({crm.leads.length} of {crm.total})</Button> : null}
      <LeadDrawer />
      <ModalHost />
    </TabsLayout>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3.5">
      <SkeletonBlock className="h-[62px]" />
      <SkeletonBlock className="h-10 w-3/5" />
      <div className="flex gap-2.5 overflow-hidden">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="flex w-[272px] flex-shrink-0 flex-col gap-2 bg-sand p-2.5">
            <SkeletonBlock className="h-2.5 w-1/2" />
            {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-[110px]" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyLeads() {
  const crm = useSalesCrm();
  return (
    <div className="flex flex-col items-center gap-3 border-[1.5px] border-line px-6 py-16 text-center">
      <span aria-hidden className="flex h-[46px] w-[46px] items-center justify-center border-[1.5px] border-ink"><LuColumns3 size={22} /></span>
      <span className="font-display text-[19px]">{crm.summary.total ? 'No matching leads' : 'No leads yet'}</span>
      <p className="max-w-[430px] text-[13.5px] leading-relaxed text-mute">{crm.summary.total ? 'Adjust the search or filters to see more leads.' : 'Add a lead from a field visit, call or referral. Website demo requests also appear here.'}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={CopyIcon} type="button" variant="primary" size="lg" onClick={() => void navigator.clipboard?.writeText(crm.bookDemoUrl)}>Copy book a demo link</Button>
        {crm.summary.total ? <Button icon={CancelIcon} variant="secondary" onClick={crm.clearFilters}>Clear filters</Button> : null}
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
 const crm=useSalesCrm();
 return (
    <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
      <span aria-hidden className="flex h-12 w-12 items-center justify-center border-[1.5px] border-accent text-[22px] font-bold text-accent">!</span>
      <h2 className="font-display text-[19px]">Leads couldn&apos;t load</h2>
      <p className="max-w-[400px] text-[13.5px] leading-relaxed text-mute">{crm.error ?? "Check your connection and try again."}</p>
      <Button icon={RetryIcon} type="button" variant="primary" size="lg" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function ModalHost() {
  const crm = useSalesCrm();
  const m = crm.modal;
  if (!m) return null;
  if (m.kind === 'create') return <CreateLeadModal />;
  if (m.kind === "filters") return <FiltersModal />;
  if (m.kind === "stages") return <StagesModal />;
  const lead = crm.getLead(m.id);
  if (!lead) return null;
  // `key` resets each flow's draft state whenever a different lead / variant opens.
  const key = `${m.kind}-${m.id}-${"variant" in m ? m.variant : "tab" in m ? m.tab : "outcome" in m ? m.outcome : ""}`;
  switch (m.kind) {
    case "more": return <MoreModal key={key} modal={m} lead={lead} />;
    case "activity": return <ActivityModal key={key} modal={m} lead={lead} />;
    case "demo": return <DemoModal key={key} modal={m} lead={lead} />;
    case "reassign": return <ReassignModal key={key} lead={lead} />;
    case "convert": return <ConvertModal key={key} lead={lead} />;
    case "lost": return <LostModal key={key} modal={m} lead={lead} />;
    case "duplicate": return <DuplicateModal key={key} lead={lead} />;
  }
}
