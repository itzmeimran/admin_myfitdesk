'use client';

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { ButtonLink } from '@/components/ButtonLink';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { ConversationIcon } from '@/core/ui/icons';
import { useBroadcastChannel } from '@/core/realtime/use-broadcast-channel';
import { cancelRefresh, requestRefresh } from '@/core/realtime/refresh-scheduler';
import { inboxCommand, loadInbox, loadInboxThread, sendInboxMessage } from '@/app/admin/whatsapp/inbox/actions';
import { ChatPane } from './chat-pane';
import { ContactPanel } from './contact-panel';
import { ConversationList } from './conversation-list';
import { mapConversation, mapItems, type RawItem } from './data';
import { nowIst, windowRemaining } from './model';
import type { Conversation, Cursor, InboxFilter, InboxInitial, OutboundMessage } from './types';

/** Reconcile via curated RPCs without remounting the open thread or its draft. */
export function InboxView({ initial }: { initial: InboxInitial }) {
 const toast = useToast();
 const { team, templates, currentUserId, canManage, canCreateLead } = initial;
 const [rows, setRows] = useState(initial.conversations);
 const [counts, setCounts] = useState(initial.counts);
 const [hasMore, setHasMore] = useState(initial.hasMore);
 const [selected, setSelected] = useState<Conversation | null>(null);
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [filter, setFilter] = useState<InboxFilter>('all');
 const [query, setQuery] = useState('');
 const [panelOpen, setPanelOpen] = useState(false);
 const [creatingLead, setCreatingLead] = useState(false);
 const [listLoading, setListLoading] = useState(false);
 const [threadLoading, setThreadLoading] = useState(false);
 const [pending, setPending] = useState(false);
 const [error, setError] = useState(initial.error);
 const [confirmBlock, setConfirmBlock] = useState(false);
 const [hasEarlier, setHasEarlier] = useState(false);
 const selectedRef = useRef<string | null>(null);
 const selectedValue = useRef(selected);
 const filters = useRef({ filter, query });
 const rowsRef = useRef(rows);
 const items = useRef<RawItem[]>([]);
 const before = useRef<Cursor | null>(null);
 const listSequence = useRef(0);
 const threadSequence = useRef(0);
 const refreshRef = useRef<() => void>(() => {});
 const pendingSends = useRef(new Map<string, OutboundMessage>());
 useEffect(() => { selectedValue.current = selected; rowsRef.current = rows; filters.current = { filter, query }; });

 const fetchList = useCallback(async (more = false) => {
  const seq = ++listSequence.current;
  const last = more ? rowsRef.current.at(-1) : undefined;
  const cursor = last?.lastMessageAt ? { at: last.lastMessageAt, id: last.id } : null;
  try {
   const result = await loadInbox(filters.current.filter, filters.current.query, cursor, selectedRef.current);
   if (seq !== listSequence.current) return;
   setError(result.error);
   if (result.data) {
    const next = result.data.rows.map(c => mapConversation(c));
    setRows(old => more ? [...old, ...next.filter(c => !old.some(o => o.id === c.id))] : next);
    setCounts(result.data.counts); setHasMore(result.data.has_more);
   }
  } catch { if (seq === listSequence.current) setError('Unable to refresh the inbox. Retry when your connection returns.'); }
  finally { if (seq === listSequence.current) setListLoading(false); }
 }, []);

 const fetchThread = useCallback(async (id: string, earlier = false, fresh = false) => {
  const sequence = ++threadSequence.current;
  try {
   const result = await loadInboxThread(id, earlier ? before.current : null);
   if (selectedRef.current !== id || sequence !== threadSequence.current) return;
   if (!result.data) { setError(result.error); return; }
   const thread = result.data;
   const merged = new Map((fresh ? [] : items.current).map(m => [m.id, m]));
   thread.items.forEach(m => merged.set(m.id, m));
   items.current = [...merged.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
   if (fresh || earlier) { before.current = thread.before; setHasEarlier(thread.has_more); }
   const messages = mapItems(items.current);
   const optimistic = [...pendingSends.current.values()].filter(m => !messages.some(r => r.kind === 'out' && r.clientRef === m.clientRef));
   setSelected({ ...mapConversation(thread.conversation), messages: [...messages, ...optimistic] });
   if (canManage && thread.conversation.unread_count > 0) {
    const through = thread.items.filter(m => m.kind === 'in').at(-1)?.created_at;
    if (through) {
     const read = await inboxCommand(id, 'read', { through });
     if (read.error) setError(read.error);
     else if (selectedRef.current === id && sequence === threadSequence.current) setSelected(c => c ? { ...c, unread: 0 } : c);
    }
   }
  } catch { if (selectedRef.current === id && sequence === threadSequence.current) setError('Unable to load messages. Please retry.'); }
  finally { if (selectedRef.current === id && sequence === threadSequence.current) setThreadLoading(false); }
 }, [canManage]);

 const refresh = useCallback(() => {
  startTransition(() => { void fetchList(); if (selectedRef.current) void fetchThread(selectedRef.current); });
 }, [fetchList, fetchThread]);
 useEffect(() => { refreshRef.current = refresh; });
 const refreshTarget = useMemo(() => ({ refresh: () => refreshRef.current() }), []);
 const schedule = useCallback(() => requestRefresh(refreshTarget), [refreshTarget]);
 useEffect(() => () => cancelRefresh(refreshTarget), [refreshTarget]);
 const live = useBroadcastChannel({ topic: 'admin:whatsapp-inbox', onChange: schedule, onReconnected: schedule });
 useEffect(() => {
  filters.current = { filter, query }; ++listSequence.current;
  const timer = setTimeout(() => { setListLoading(true); startTransition(() => { void fetchList(); }); }, 300);
  return () => clearTimeout(timer);
 }, [filter, query, fetchList]);
 useEffect(() => {
  const tick = () => {
   setRows(all => all.map(c => ({ ...c, windowLeft: windowRemaining(c.windowEndsAt ?? null) })));
   setSelected(c => c ? { ...c, windowLeft: windowRemaining(c.windowEndsAt ?? null) } : c);
  };
  const timer = setInterval(tick, 30000);
  const onVisible = () => { if (!document.hidden) { tick(); refreshRef.current(); } };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
 }, []);

 const select = (id: string) => {
  selectedRef.current = id; setSelectedId(id); setCreatingLead(false); items.current = []; before.current = null; pendingSends.current.clear();
  setSelected(rows.find(c => c.id === id) ?? null); setThreadLoading(true); setError(null);
  if (!window.matchMedia('(min-width: 1024px)').matches) setPanelOpen(false);
  startTransition(() => { void fetchThread(id, false, true); });
 };
 const deselect = () => { selectedRef.current = null; setSelectedId(null); setSelected(null); setPanelOpen(false); setCreatingLead(false); };
 const mutate = async (command: string, input: Record<string, unknown> = {}, id = selectedRef.current): Promise<boolean> => {
  if (!id) return false;
  try {
   const result = await inboxCommand(id, command, input);
   if (result.error) { toast.error(result.error); return false; }
   if ((command === 'archive' || command === 'block' || command === 'unread') && selectedRef.current === id) deselect();
   else await fetchThread(id);
   await fetchList(); return true;
  } catch { toast.error('Unable to save the change. Please retry.'); return false; }
 };
 const run = (command: string, input: Record<string, unknown> = {}) => {
  setPending(true); startTransition(async () => { await mutate(command, input); setPending(false); });
 };
 const send = (text: string, templateKey?: string, retryMessage?: OutboundMessage) => {
  const c = selectedValue.current;
  if (!c || !canManage) return;
  const clientRef = retryMessage?.clientRef ?? crypto.randomUUID();
  const optimistic: OutboundMessage = { id: retryMessage?.id ?? clientRef, clientRef, kind: 'out', text, at: nowIst(), status: 'sending', source: 'manual', by: team.find(t => t.id === currentUserId)?.short ?? 'Me', template: templateKey };
  pendingSends.current.set(clientRef, optimistic);
  setSelected(old => old ? { ...old, messages: [...old.messages.filter(m => m.id !== optimistic.id), optimistic] } : old);
  startTransition(async () => {
   try {
    const result = await sendInboxMessage({ conversationId: c.id, clientRef, body: text, templateKey, retry: Boolean(retryMessage) });
    if (result.error) toast.error(result.error);
    if (selectedRef.current === c.id) {
     if (result.id) pendingSends.current.delete(clientRef);
     else pendingSends.current.set(clientRef, { ...optimistic, status: 'failed', retryable: true, error: result.error ?? undefined });
    }
   } catch {
    if (selectedRef.current === c.id) pendingSends.current.set(clientRef, { ...optimistic, error: 'Waiting for confirmation. Reload before retrying.', retryable: false });
    toast.error('Connection lost. Waiting for delivery confirmation.');
   }
   await fetchThread(c.id); await fetchList();
  });
 };
 const retry = (id: string) => {
  const m = selected?.messages.find(m => m.id === id);
  if (m?.kind === 'out' && m.retryable) {
   const key = m.templateKey ?? (m.template && !m.template.includes(':') ? templates.find(t => t.name === m.template)?.key : m.template);
   send(m.text, key, m);
  }
 };

 return (
  <div className="flex h-[calc(100dvh-12.25rem)] min-h-[520px] flex-col overflow-hidden border-[1.5px] border-ink bg-paper md:h-[calc(100dvh-9rem)]">
   {error || initial.templateError || !initial.configured ? <div role="alert" className="border-b border-line bg-sand px-4 py-2 text-[12.5px]">{error ?? initial.templateError ?? 'Managed WhatsApp sending is not configured for this environment.'}<Button variant="link" size="xs" onClick={refresh}>Reload</Button></div> : null}
   {live !== 'live' ? <div role="status" className="flex items-center gap-3 border-b border-line px-4 py-2 text-[12.5px]"><b>{live === 'offline' ? 'Offline' : 'Reconnecting…'}</b><span className="flex-1 text-mute">Messages will refresh when the connection returns.</span><Button variant="secondary" size="xs" onClick={refresh}>Retry</Button></div> : null}
   <div className="relative flex min-h-0 flex-1">
    <div className={`${selectedId ? 'hidden lg:flex' : 'flex'} w-full flex-shrink-0 flex-col border-line lg:w-[288px] lg:border-r xl:w-[340px]`}>
     <ConversationList rows={rows} totalCount={counts.total} openCount={counts.open} unreadCount={counts.unread} team={team} selectedId={selectedId} filter={filter} query={query} loading={listLoading} onSelect={select} onFilter={setFilter} onQuery={setQuery} />
     {hasMore ? <Button variant="secondary" size="sm" disabled={listLoading} onClick={() => { setListLoading(true); startTransition(() => { void fetchList(true); }); }}>Load more conversations</Button> : null}
     {canManage ? <ButtonLink href="/admin/whatsapp/hidden" variant="link" size="xs">Archived &amp; blocked</ButtonLink> : null}
    </div>
    <section aria-label="Conversation" className={`${selectedId ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
     {selected ? <ChatPane key={selected.id} conversation={selected} team={team} templates={templates} currentUserId={currentUserId} loading={threadLoading} panelOpen={panelOpen}
      canManage={canManage} canSend={canManage && initial.configured} pending={pending} hasEarlier={hasEarlier} onLoadEarlier={() => startTransition(() => { void fetchThread(selected.id, true); })}
      onBack={deselect} onTogglePanel={() => setPanelOpen(o => !o)} onOpenPanel={options => { setPanelOpen(true); setCreatingLead(Boolean(options?.create)); }}
      onAssign={assigneeId => run('assign', { assigneeId })} onToggleClosed={() => run(selected.status === 'open' ? 'close' : 'reopen')}
      onMarkUnread={() => run('unread')} onArchive={() => run('archive')} onBlock={() => setConfirmBlock(true)} onSend={send} onRetry={retry} />
      : <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center"><ConversationIcon size={22}/><b>{counts.total ? 'No conversation selected' : 'Your inbox is empty'}</b><p className="max-w-[300px] text-[13px] text-mute">{counts.total ? 'Select a conversation to view messages.' : 'When a gym owner or lead messages MyFitDesk on WhatsApp, the conversation opens here.'}</p></div>}
    </section>
    {selected && panelOpen ? <aside aria-label="Contact details" className="absolute inset-y-0 right-0 z-20 flex w-full flex-shrink-0 flex-col border-ink bg-paper lg:w-[300px] lg:border-l-[1.5px] 2xl:static 2xl:z-auto 2xl:border-l 2xl:border-line">
     <ContactPanel key={selected.id} conversation={selected} team={team} startCreating={creatingLead} canManage={canManage} canCreateLead={canCreateLead} pending={pending}
      onClose={() => { setPanelOpen(false); setCreatingLead(false); }} onAssign={assigneeId => run('assign', { assigneeId })}
      onNote={async (note, version) => { let ok = false; await new Promise<void>(resolve => startTransition(async () => { ok = await mutate('note', { note, version }, selected.id); resolve(); })); return ok; }}
      onCreateLead={async input => { setPending(true); let ok = false; await new Promise<void>(resolve => startTransition(async () => { ok = await mutate('lead', input); resolve(); })); setPending(false); if (ok) { setCreatingLead(false); toast.success('Linked to Sales CRM'); } return ok; }} />
    </aside> : null}
   </div>
   <ConfirmDialog open={confirmBlock} title="Block this number?" description="This conversation will be hidden and future inbound messages will be dropped. You can unblock it from Archived & blocked." confirmLabel="Block number" danger pending={pending}
    onCancel={() => setConfirmBlock(false)} onConfirm={() => { setConfirmBlock(false); run('block'); }} />
  </div>
 );
}
