"use client";

import { Button } from "@/components/Button";
import { SearchIcon, InboxIcon, ConfirmIcon } from "@/core/ui/icons";
import type { IconType } from "@/core/ui/icons";
import { FILTERS, WINDOW_DOT, WINDOW_LABEL, initials, lastTextMessage, windowState } from "./model";
import type { Conversation, InboxFilter, TeamMember } from "./types";

type Props = {
  /** Conversations after search + tab filtering. */
  rows: Conversation[];
  /** Every conversation, so the empty state can tell "no results" from "no inbox". */
  totalCount: number;
  openCount: number;
  unreadCount: number;
  team: TeamMember[];
  selectedId: string | null;
  filter: InboxFilter;
  query: string;
  loading: boolean;
  onSelect: (id: string) => void;
  onFilter: (filter: InboxFilter) => void;
  onQuery: (query: string) => void;
};

/** The left pane: heading, search, filter tabs and the conversation rows. */
export function ConversationList({
  rows, totalCount, openCount, unreadCount, team, selectedId, filter, query, loading, onSelect, onFilter, onQuery,
}: Props) {
  const q = query.trim();
  let empty: { icon: IconType; title: string; body: string; cta?: string; act?: () => void } | null = null;
  if (!loading && !rows.length) {
    if (!totalCount) empty = { icon: InboxIcon, title: "No conversations yet", body: "Messages sent to your WhatsApp Business number will appear here." };
    else if (q) empty = { icon: SearchIcon, title: `No results for “${q}”`, body: "Try a name, phone number or a word from the message.", cta: "Clear search", act: () => onQuery("") };
    else if (filter === "unread") empty = { icon: ConfirmIcon, title: "No unread conversations", body: "You're all caught up.", cta: "View all", act: () => onFilter("all") };
    else empty = { icon: InboxIcon, title: "Nothing here", body: "No conversations match this filter.", cta: "View all", act: () => onFilter("all") };
  }

  return (
    <section aria-label="Conversations" className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pb-3 pt-[18px]">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-[20px] leading-tight tracking-[-0.02em]">WhatsApp Inbox</h1>
          <span className="ml-auto text-[11.5px] text-mute2">{openCount} open</span>
        </div>
        <label className="flex min-h-11 items-center gap-2 border-[1.5px] border-line px-2.5 transition-colors focus-within:border-ink lg:min-h-9">
          <SearchIcon size={15} className="flex-shrink-0 text-mute2" aria-hidden />
          <input
            type="search"
            aria-label="Search conversations"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name, number or message"
            className="w-full min-w-0 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint lg:text-[13px]"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Filter conversations" className="flex flex-shrink-0 gap-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          const count = f.key === "unread" && unreadCount ? unreadCount : 0;
          return (
            <Button
              key={f.key}
              role="tab"
              aria-selected={on}
              variant="control"
              size="custom"
              onClick={() => onFilter(f.key)}
              className={`-mb-px min-h-10 gap-1.5 whitespace-nowrap border-0 border-b-2 p-0 text-[12.5px] font-bold hover:bg-transparent ${on ? "border-b-ink text-ink" : "border-b-transparent text-mute2 hover:border-b-line hover:text-ink"}`}
            >
              {f.label}
              {count ? <span className="text-[11px] text-accent">{count}</span> : null}
            </Button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <ConversationListSkeleton /> : null}

        {empty ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
            <span aria-hidden="true" className="flex h-[42px] w-[42px] items-center justify-center border-[1.5px] border-line text-mute2">
              <empty.icon size={20} />
            </span>
            <span className="text-[14.5px] font-bold">{empty.title}</span>
            <p className="max-w-[260px] text-pretty text-[12.5px] leading-relaxed text-mute">{empty.body}</p>
            {empty.cta ? <Button variant="secondary" size="sm" onClick={empty.act}>{empty.cta}</Button> : null}
          </div>
        ) : null}

        {!loading && rows.length ? (
          <div role="list">
            {rows.map((c) => {
              const on = c.id === selectedId;
              const unread = c.unread > 0;
              const last = lastTextMessage(c);
              const state = windowState(c);
              const assignee = team.find((t) => t.id === c.assigneeId);
              return (
                <Button
                  key={c.id}
                  role="listitem"
                  variant="control"
                  size="custom"
                  aria-current={on ? "true" : undefined}
                  onClick={() => onSelect(c.id)}
                  className={`w-full justify-start gap-3 border-0 border-b border-l-2 border-b-sand py-3 pl-3.5 pr-4 text-left font-normal hover:border-b-sand ${on ? "border-l-ink bg-sand" : "border-l-transparent"}`}
                >
                  <span aria-hidden="true" className={`flex h-9 w-9 flex-shrink-0 items-center justify-center text-[11.5px] font-bold ${unread ? "bg-ink text-hi" : "bg-sand text-ink"}`}>
                    {initials(c.name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[13.5px] ${unread ? "font-bold" : "font-medium"}`}>{c.name ?? c.phone}</span>
                      <span className={`flex-shrink-0 text-[11px] ${unread ? "font-bold text-accent" : "text-mute2"}`}>{c.time}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unread ? "text-ink" : "text-mute"}`}>
                        {last ? `${last.kind === "out" ? "You: " : ""}${last.text}` : ""}
                      </span>
                      {unread ? (
                        <span aria-label={`${c.unread} unread`} className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center bg-accent px-[5px] text-[10px] font-bold text-paper">
                          {c.unread}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex min-w-0 items-center gap-[7px] text-[11px] text-mute2">
                      <span className="truncate whitespace-nowrap">{c.name ? c.phone : "Not in contacts"}</span>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 flex-shrink-0 ${WINDOW_DOT[state]}`} />
                      <span className="whitespace-nowrap">{WINDOW_LABEL[state]}</span>
                      {assignee ? (
                        <span title={assignee.name} className="ml-auto flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center border border-line text-[8.5px] font-bold text-mute">
                          {assignee.ini}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const SKELETON_ROWS: Array<[string, string]> = [["62%", "86%"], ["48%", "70%"], ["55%", "80%"], ["40%", "66%"], ["58%", "76%"], ["45%", "82%"], ["52%", "60%"]];

/** Shown while the conversation list loads (also the route's `loading.tsx`). */
export function ConversationListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversations">
      {SKELETON_ROWS.map(([w1, w2], i) => (
        <div key={i} className="flex gap-3 border-b border-sand px-4 py-3.5">
          <span className="skeleton-shimmer h-9 w-9 flex-shrink-0" />
          <span className="flex flex-1 flex-col gap-2 pt-[3px]">
            <span className="skeleton-shimmer block h-[9px]" style={{ width: w1 }} />
            <span className="skeleton-shimmer block h-2" style={{ width: w2 }} />
          </span>
        </div>
      ))}
    </div>
  );
}
