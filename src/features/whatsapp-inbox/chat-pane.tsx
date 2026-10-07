"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import {
  AttachIcon, CancelIcon, ClockIcon, ConfirmIcon, CrmIcon, DetailsPanelIcon, DoubleCheckIcon,
  FailedIcon, MoreIcon, NextPageIcon, PrevPageIcon, SendIcon, TemplateIcon,
} from "@/core/ui/icons";
import type { IconType } from "@/core/ui/icons";
import { WINDOW_DOT, initials, lastOutboundIndex, windowState } from "./model";
import type { Conversation, Message, MessageStatus, MessageTemplate, TeamMember } from "./types";
import { InviteIcon, LoadMoreIcon, RestoreIcon } from '@/core/ui/icons';
import { iconForAction } from '@/core/ui/action-icons';

type Props = {
  conversation: Conversation;
  team: TeamMember[];
  templates: MessageTemplate[];
  currentUserId: string;
  loading: boolean;
  panelOpen: boolean;
  onBack: () => void;
  onTogglePanel: () => void;
  onOpenPanel: (options?: { create?: boolean }) => void;
  onAssign: (assigneeId: string | null) => void;
  onToggleClosed: () => void;
  onMarkUnread: () => void;
  onArchive: () => void;
  onBlock: () => void;
  onSend: (text: string, templateKey?: string) => Promise<boolean>;
  onRetry: (messageId: string) => void;
  canManage: boolean;
  canSend: boolean;
  pending: boolean;
  hasEarlier: boolean;
  onLoadEarlier: () => void;
};

const STATUS: Record<MessageStatus, { icon: IconType; label: string; tone: string }> = {
  sending: { icon: ClockIcon, label: "Sending…", tone: "text-mute2" },
  sent: { icon: ConfirmIcon, label: "Sent", tone: "text-mute2" },
  delivered: { icon: DoubleCheckIcon, label: "Delivered", tone: "text-mute2" },
  read: { icon: DoubleCheckIcon, label: "Read", tone: "text-ink" },
  failed: { icon: FailedIcon, label: "Not sent", tone: "text-accent" },
};

/** Center pane: conversation header, message thread and the reply composer.
 * Mount it with `key={conversation.id}` so the draft and open popovers reset
 * when another conversation is selected. */
export function ChatPane({
  conversation: c, team, templates, currentUserId, loading, panelOpen,
  onBack, onTogglePanel, onOpenPanel, onAssign, onToggleClosed, onMarkUnread, onArchive, onBlock, onSend, onRetry,
  canManage, canSend, pending, hasEarlier, onLoadEarlier,
}: Props) {
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<"closed" | "main" | "assign">("closed");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const firstScroll = useRef(true);
  const previousScroll = useRef({ height: 0, top: 0 });
  const prepending = useRef(false);
  const [newMessages, setNewMessages] = useState(false);

  const state = windowState(c);
  const assignee = team.find((t) => t.id === c.assigneeId);
  const firstName = (c.name ?? c.profileName ?? '').split(/\s+/)[0] || 'there';
  const hasDraft = draft.trim().length > 0;
  const popoverOpen = menu !== "closed" || templatesOpen;
  const lastOut = lastOutboundIndex(c);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prepending.current) { el.scrollTop = previousScroll.current.top + el.scrollHeight - previousScroll.current.height; prepending.current = false; }
    else if (firstScroll.current || nearBottom.current) { el.scrollTop = el.scrollHeight; firstScroll.current = false; }
    else setNewMessages(true);
  }, [c.messages.length, loading]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenu("closed"); setTemplatesOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popoverOpen]);

  const closePopovers = () => { setMenu("closed"); setTemplatesOpen(false); };
  const submit = () => {
    if (!hasDraft || !canSend || pending || state !== 'open') return;
    const submitted=draft;
    void onSend(submitted).then(sent=>{if(sent)setDraft(current=>current===submitted?'':current);});
  };
  const menuItem = (label: string, run: () => void, options: { arrow?: boolean; danger?: boolean; separated?: boolean } = {}) => (
    <Button icon={iconForAction(label)}
      key={label}
      role="menuitem"
      disabled={!canManage || pending}
      variant="control"
      size="custom"
      onClick={() => { run(); }}
      className={`min-h-[38px] w-full justify-start border-0 px-3 text-left text-[13px] font-normal ${options.separated ? "border-t border-t-line" : ""} ${options.danger ? "text-accent" : "text-ink"}`}
    >
      <span className="flex-1">{label}</span>
      {options.arrow ? <NextPageIcon size={13} className="text-mute2" aria-hidden /> : null}
    </Button>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex min-h-[62px] flex-shrink-0 items-center gap-3 border-b border-line px-3.5 py-2.5 lg:px-6">
        <Button icon={PrevPageIcon} variant="control" size="custom" onClick={onBack} aria-label="Back to Inbox" className="-ml-2 min-h-11 gap-0.5 border-0 pr-1.5 text-[13px] font-bold lg:hidden">
          Inbox
        </Button>
        <span aria-hidden="true" className="flex h-9 w-9 flex-shrink-0 items-center justify-center bg-sand text-[11.5px] font-bold">{initials(c.name)}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14.5px] font-bold">{c.name ?? c.phone}</span>
          <span className="flex min-w-0 items-center gap-[7px] overflow-hidden whitespace-nowrap text-[11.5px] text-mute">
            <span>{c.phone}</span>
            <span aria-hidden="true" className={`h-1.5 w-1.5 flex-shrink-0 ${WINDOW_DOT[state]}`} />
            <span className="truncate">
              {state === "closed" ? "Closed" : state === "open" ? `Reply window · ${c.windowLeft} left` : "Reply window expired"}
            </span>
          </span>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <Button icon={CrmIcon}
            variant="control"
            size="custom"
            onClick={() => onOpenPanel()}
            className={`min-h-8 gap-[7px] whitespace-nowrap border-[1.5px] px-2.5 text-[11.5px] font-bold ${c.crm ? "border-line" : "border-dashed border-[#c9bcab]"}`}
          >

            {c.crm ? `CRM · ${c.crm.stage}` : "Not in CRM"}
          </Button>
          <Button icon={InviteIcon}
            variant="control"
            size="custom"
            onClick={() => setMenu("assign")}
            disabled={!canManage || pending}
            aria-label={assignee ? `Assigned to ${assignee.name}, change` : "Assign conversation"}
            className="min-h-8 gap-[7px] whitespace-nowrap border-[1.5px] border-line py-0 pl-1 pr-2.5 text-[11.5px] font-bold"
          >
            <span className={`flex h-[22px] w-[22px] items-center justify-center text-[9px] font-bold ${assignee ? "bg-sand text-ink" : "text-mute2"}`}>{assignee ? assignee.ini : "+"}</span>
            <span className="hidden xl:inline">{assignee ? assignee.short : "Assign"}</span>
          </Button>
          <Button icon={DetailsPanelIcon}
            variant="control"
            size="custom"
            iconOnly
            onClick={onTogglePanel}
            aria-label="Contact details"
            aria-pressed={panelOpen}
            className={`h-[34px] w-[34px] border-[1.5px] ${panelOpen ? "border-ink bg-ink text-paper hover:bg-ink" : "border-line"}`}
           />
        </div>

        <div className="relative">
          <Button icon={MoreIcon}
            variant="control"
            size="custom"
            iconOnly
            onClick={() => setMenu((m) => (m === "closed" ? "main" : "closed"))}
            aria-label="Conversation actions"
            aria-haspopup="menu"
            aria-expanded={menu !== "closed"}
            className="h-[34px] w-[34px] border-[1.5px] border-line"
           />
          {menu !== "closed" ? (
            <div role="menu" className="absolute right-0 top-[42px] z-30 w-[230px] border-[1.5px] border-ink bg-paper py-1">
              {menu === "assign" ? (
                <div>
                  <Button icon={PrevPageIcon}
                    variant="control"
                    size="custom"
                    onClick={() => setMenu("main")}
                    className="min-h-9 w-full justify-start gap-1.5 border-0 border-b border-b-line px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute2"
                  >
                    Assign to
                  </Button>
                  {[...team.map((t) => ({ id: t.id as string | null, ini: t.ini, name: t.name + (t.id === currentUserId ? " (you)" : "") })), { id: null, ini: "—", name: "Unassigned" }].map((o) => {
                    const on = (c.assigneeId ?? null) === o.id;
                    return (
                <Button icon={InviteIcon}
                        key={o.id ?? "none"}
                        role="menuitemradio"
                        disabled={!canManage || pending}
                        aria-checked={on}
                        variant="control"
                        size="custom"
                        onClick={() => { onAssign(o.id); closePopovers(); }}
                        className="min-h-[38px] w-full justify-start gap-2.5 border-0 px-3 text-left text-[13px] font-normal"
                      >
                        <span className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center border border-line text-[9px] font-bold text-mute">{o.ini}</span>
                        <span className="flex-1">{o.name}</span>
                        {on ? <ConfirmIcon size={14} aria-hidden /> : null}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <div>
                  {menuItem("Assign conversation", () => setMenu("assign"), { arrow: true })}
                  {menuItem("Mark as unread", () => { onMarkUnread(); closePopovers(); })}
                  {menuItem(c.status === "open" ? "Close conversation" : "Reopen conversation", () => { onToggleClosed(); closePopovers(); })}
                  {c.crm
                    ? menuItem("View CRM lead", () => { onOpenPanel(); closePopovers(); })
                    : menuItem("Create CRM lead", () => { onOpenPanel({ create: true }); closePopovers(); })}
                  {menuItem("Archive", () => { onArchive(); closePopovers(); }, { separated: true })}
                  {menuItem("Block number", () => { onBlock(); closePopovers(); }, { danger: true })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Thread */}
      {loading ? <ChatSkeleton /> : (
        <div ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; } }} className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-5 pt-4 lg:px-6">
          <div className="mx-auto flex max-w-[720px] flex-col gap-1">
            {hasEarlier ? <Button variant="link" size="sm" onClick={() => { const el = scrollRef.current; if (el) previousScroll.current = { height: el.scrollHeight, top: el.scrollTop }; prepending.current = true; onLoadEarlier(); }}>Load earlier messages</Button> : null}
            {c.messages.map((m, i) => (
              <MessageRow key={m.id} message={m} previous={c.messages[i - 1]} showStatusLabel={i === lastOut} onRetry={onRetry} canRetry={canSend} />
            ))}
          </div>
        </div>
      )}
      {newMessages ? <Button icon={LoadMoreIcon} variant="secondary" size="xs" className="self-center" onClick={() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; nearBottom.current = true; setNewMessages(false); }}>New messages</Button> : null}

      {/* Composer */}
      <div className="relative flex-shrink-0 border-t border-line px-3.5 pb-3.5 pt-2.5 lg:px-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-2">
          {state === "open" && !loading ? (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-[7px] text-[11.5px] text-mute">
                <span aria-hidden="true" className="h-1.5 w-1.5 bg-ink" />
                <b className="text-ink">Reply window active</b><span>· {c.windowLeft} left</span>
              </span>
              <div className={`border-[1.5px] bg-[#fbf8f3] ${focused ? "border-ink" : "border-line"}`}>
                <textarea
                  rows={2}
                  aria-label="Reply"
                  value={draft}
                  maxLength={4096}
                  disabled={!canSend || pending}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Write a reply…"
                  className="block w-full resize-none border-0 bg-transparent px-3 pb-1 pt-2.5 text-[16px] leading-normal text-ink outline-none placeholder:text-faint lg:text-[13px]"
                />
                <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-1">
                  {/* Media upload is a follow-up; inbound media has a safe placeholder. */}
                  <Button icon={AttachIcon} variant="ghost" size="custom" iconOnly aria-label="Attach file" disabled title="Attachments aren't available yet" className="h-[34px] w-[34px] border-0" />
                  <Button icon={TemplateIcon}
                    variant="ghost"
                    size="custom"
                    onClick={() => { setTemplatesOpen((o) => !o); setMenu("closed"); }}
                    disabled={!canSend || pending}
                    aria-expanded={templatesOpen}
                    className="min-h-[34px] gap-1.5 border-0 px-2 text-[12px] font-bold normal-case tracking-normal"
                  >
                    Template
                  </Button>
                  <span className="ml-auto hidden text-[11px] text-faint lg:inline">Enter to send · Shift + Enter for new line</span>
                  <Button icon={SendIcon}
                    variant="primary"
                    size="custom"
                    onClick={submit}
                    pending={pending} disabled={!hasDraft || !canSend || pending}
                    className="ml-auto min-h-[34px] gap-[7px] px-3.5 text-[11.5px] disabled:border-line disabled:bg-line disabled:text-mute2 lg:ml-3"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {state === "expired" && !loading ? (
            <div className="flex flex-wrap items-center gap-3 bg-sand px-4 py-3.5">
              <ClockIcon size={18} className="flex-shrink-0" aria-hidden />
              <p className="min-w-[200px] flex-1 text-pretty text-[13px] leading-normal text-mute">
                <b className="text-ink">24-hour reply window expired.</b> Send an approved template to continue the conversation.
              </p>
              <Button variant="primary" size="md" disabled={!canSend || pending} icon={TemplateIcon} onClick={() => setTemplatesOpen((o) => !o)} aria-expanded={templatesOpen}>
                Select template
              </Button>
            </div>
          ) : null}

          {state === "closed" && !loading ? (
            <div className="flex flex-wrap items-center gap-3 border-[1.5px] border-dashed border-line px-4 py-3">
              <p className="min-w-[180px] flex-1 text-[13px] text-mute">This conversation is closed.</p>
              <Button icon={RestoreIcon} variant="secondary" size="sm" disabled={!canManage || pending} onClick={onToggleClosed}>Reopen</Button>
            </div>
          ) : null}
        </div>

        {templatesOpen ? (
          <div role="dialog" aria-label="Approved templates" className="absolute inset-x-3.5 bottom-[calc(100%-4px)] z-30 max-w-[420px] border-[1.5px] border-ink bg-paper lg:left-6 lg:right-6">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <span className="flex-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute">Approved templates</span>
              <Button icon={CancelIcon} variant="ghost" size="custom" iconOnly onClick={() => setTemplatesOpen(false)} aria-label="Close templates" className="h-7 w-7 border-0" />
            </div>
            {templates.map((t) => {
              const body = t.body.replace("{n}", firstName);
              return (
                <Button
                  key={t.key}
                  disabled={!canSend || pending}
                  variant="control"
                  size="custom"
                  onClick={() => { void onSend(body,t.key).then(sent=>{if(sent)setTemplatesOpen(false);}); }}
                  className="w-full flex-col items-stretch gap-1 border-0 border-b border-b-sand px-3 py-2.5 text-left font-normal"
                >
                  <span className="flex items-center gap-2">
                    <TemplateIcon size={15} className="flex-shrink-0 text-mute" aria-hidden />
                    <span className="flex-1 font-mono text-[12px] font-bold">{t.key}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-mute2">{t.category}</span>
                  </span>
                  <span className="max-h-[35px] overflow-hidden text-[12px] leading-snug text-mute">{body}</span>
                </Button>
              );
            })}
            {!templates.length ? <p className="px-3 py-4 text-[12px] text-mute">No approved platform templates are available.</p> : null}
          </div>
        ) : null}
      </div>

      {/* Click-away layer for the menu / template popovers. */}
      {popoverOpen ? <div aria-hidden="true" onClick={closePopovers} className="absolute inset-0 z-[25]" /> : null}
    </div>
  );
}

function MessageRow({ message: m, previous, showStatusLabel, onRetry, canRetry }: {
  message: Message; previous?: Message; showStatusLabel: boolean; onRetry: (id: string) => void; canRetry: boolean;
}) {
  if (m.kind === "day") {
    return <span className="self-start pb-1.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-mute2">{m.text}</span>;
  }
  if (m.kind === "sys") {
    return <span className="self-center py-1.5 text-center text-pretty text-[11.5px] text-mute2">{m.text} · {m.at}</span>;
  }
  const sideChanged = previous && (previous.kind === "in" || previous.kind === "out") && previous.kind !== m.kind;
  const spacing = sideChanged ? "mt-2.5" : "";

  if (m.kind === "in") {
    return (
      <div className={`flex max-w-[86%] flex-col items-start lg:max-w-[72%] ${spacing}`}>
        <div className="whitespace-pre-wrap text-pretty bg-sand px-3 py-[9px] text-[13.5px] leading-normal">{m.text}</div>
        <span className="px-0.5 pt-[3px] text-[10.5px] text-mute2">{m.at}</span>
      </div>
    );
  }

  const st = STATUS[m.status];
  const StatusIcon = st.icon;
  const failed = m.status === "failed";
  const sourceLabel = m.source === "ai" ? "AI" : m.source === "auto" ? "Automation" : `Manual · ${m.by ?? "Platform admin"}`;
  return (
    <div className={`flex max-w-[86%] flex-col items-end self-end lg:max-w-[72%] ${spacing} ${m.status === "sending" ? "opacity-65" : ""}`}>
      <div className={`flex flex-col text-pretty px-3 py-[9px] text-[13.5px] leading-normal text-ink ${failed ? "bg-accent/10" : "bg-[#f6e3b0]"}`}>
        {m.template ? (
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-mute">
            <TemplateIcon size={12} aria-hidden />Template · {m.template}
          </span>
        ) : null}
        <span className="whitespace-pre-wrap">{m.text}</span>
      </div>
      <span className="flex items-center gap-1.5 px-0.5 pt-[3px] text-[10.5px] text-mute2">
        {m.source === "ai" ? <span aria-hidden="true" className="h-[5px] w-[5px] bg-hi" /> : null}
        <span>{sourceLabel}</span><span aria-hidden="true">·</span><span>{m.at}</span>
        <StatusIcon size={14} className={st.tone} role="img" aria-label={st.label} />
        {showStatusLabel || failed || m.status === "sending" ? <span className={`font-bold ${st.tone}`}>{st.label}</span> : null}
        {failed && m.retryable && canRetry ? (
          <Button variant="link" size="custom" onClick={() => onRetry(m.id)} className="min-h-6 px-0.5 text-[10.5px] font-bold text-accent underline">
            Retry
          </Button>
        ) : null}
      </span>
      {m.error ? <span className="max-w-full text-pretty pt-1 text-[11px] text-accent">{m.error}</span> : null}
    </div>
  );
}

const SKELETON_BUBBLES: Array<["self-start" | "self-end", string, string]> = [
  ["self-start", "46%", "40px"], ["self-end", "38%", "40px"], ["self-start", "60%", "58px"], ["self-end", "52%", "40px"], ["self-start", "30%", "40px"],
];

/** Shown while a conversation's messages load. */
export function ChatSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading messages" className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-3 px-3.5 py-6 lg:px-6">
      {SKELETON_BUBBLES.map(([align, w, h], i) => (
        <span key={i} className={`skeleton-shimmer block ${align}`} style={{ width: w, height: h }} />
      ))}
    </div>
  );
}
