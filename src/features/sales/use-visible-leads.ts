"use client";

import { useMemo } from "react";
import { attentionReasons, inScope, matchesFilters } from "./derive";
import { ROLE_CONFIG, type Lead, type Scope } from "./model";
import { useSalesCrm } from "./use-sales-crm";

/**
 * Display filters over the authorized page returned by SQL. SQL enforces
 * visibility, searches and pagination over the full permitted scope.
 */
export function useVisibleLeads(): {
  scope: Scope;
  team: string;
  /** Everything the viewer may see. */
  scoped: Lead[];
  /** `scoped` after search, filters and the "needs attention" toggle. */
  shown: Lead[];
  attentionLeads: Lead[];
} {
  const s = useSalesCrm();
  const cfg = ROLE_CONFIG[s.role];
  const scope = cfg.scopes.includes(s.scope) ? s.scope : cfg.defaultScope;
  const team = s.role === "manager" ? (s.me.team ?? "") : s.team;

  const scoped = useMemo(
    () => s.leads.filter((l) => inScope(l, scope, team, s.me.id, s.users)),
    [s.leads, scope, team, s.me.id, s.users],
  );
  const shown = useMemo(
    () => scoped.filter((l) => matchesFilters(l, s.filters, s.query, s.attentionOnly)),
    [scoped, s.filters, s.query, s.attentionOnly],
  );
  const attentionLeads = useMemo(() => scoped.filter((l) => attentionReasons(l).length > 0), [scoped]);

  return { scope, team, scoped, shown, attentionLeads };
}
