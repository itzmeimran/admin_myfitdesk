import { IST_TIME_ZONE, istDateKey, istDayDifference } from '@/core/dates/ist';
import { initials, windowRemaining } from './model';
import type { Conversation, Cursor, InboxCounts, Message, MessageStatus, TeamMember } from './types';

export type RawConversation = { id: string; name: string | null; org: string; phone_e164: string; profile_name: string | null;
 assignee_id: string | null; status: 'open' | 'closed'; window_ends_at: string | null; crm: Conversation['crm'];
 created_at: string; last_message_at: string; last_message_preview: string; unread_count: number; note: string; note_version: number };
export type RawItem = { id: string; kind: 'in' | 'out' | 'sys'; created_at: string; body?: string; status?: MessageStatus;
 source?: 'manual' | 'auto' | 'ai'; by?: string; template_name?: string; error_code?: string; error_message?: string;
 event?: string; actor?: string; target?: string; client_ref?: string; template_language?: string; meta_message_id?: string | null };
export type RawList = { rows: RawConversation[]; counts: InboxCounts; has_more: boolean };
export type RawThread = { conversation: RawConversation; items: RawItem[]; has_more: boolean; before: Cursor | null };
export type Bootstrap = { team: { id: string; name: string }[]; allowed_templates: { name: string; language: string }[] };
const time = (at: string) => new Date(at).toLocaleTimeString('en-GB', { timeZone: IST_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const date = (at: string) => new Date(at).toLocaleDateString('en-IN', { timeZone: IST_TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const stages: Record<string, string> = { new: 'New lead', contacted: 'Contacted', interested: 'Interested', demo_req: 'Demo requested', trial: 'Trial', converted: 'Converted', followup: 'Follow-up' };
export function mapConversation(c: RawConversation, now = new Date()): Conversation {
 const days = istDayDifference(new Date(c.last_message_at), now);
 return { id: c.id, name: c.name, org: c.org, phone: c.phone_e164, assigneeId: c.assignee_id, status: c.status,
  windowEndsAt: c.window_ends_at, windowLeft: windowRemaining(c.window_ends_at), crm: c.crm ? { ...c.crm, stage: stages[c.crm.stage] ?? c.crm.stage } : null,
  first: date(c.created_at), time: days === 0 ? time(c.last_message_at) : days < 7 ? new Date(c.last_message_at).toLocaleDateString('en-IN', { timeZone: IST_TIME_ZONE, weekday: 'short' }) : date(c.last_message_at),
  unread: c.unread_count, note: c.note, noteVersion: c.note_version, messages: [], preview: c.last_message_preview, lastMessageAt: c.last_message_at, profileName: c.profile_name };
}
export const mapTeam = (rows: Bootstrap['team']): TeamMember[] => rows.map(t => ({ ...t, ini: initials(t.name), short: t.name.split(/\s+/)[0] }));
function eventText(item: RawItem) {
 const actor = item.actor ?? 'Platform admin';
 switch (item.event) {
  case 'assign': return item.target ? `Assigned to ${item.target} by ${actor}` : `Unassigned by ${actor}`;
  case 'close': return `Closed by ${actor}`;
  case 'reopen': return `Reopened by ${actor}`;
  case 'inbound_reopened': return 'Reopened after a new reply';
  case 'lead': return `Linked to Sales CRM by ${actor}`;
  case 'archive': return `Archived by ${actor}`;
  case 'block': return `Blocked by ${actor}`;
  case 'unblock': return `Unblocked by ${actor}`;
  default: return 'Conversation updated';
 }
}
export function mapItems(items: RawItem[]): Message[] {
 const result: Message[] = []; let previousDay = '';
 for (const m of items) {
  const day = istDateKey(new Date(m.created_at));
  if (day !== previousDay) { result.push({ id: `day-${day}`, kind: 'day', text: day === istDateKey() ? 'Today' : date(m.created_at) }); previousDay = day; }
  if (m.kind === 'sys') result.push({ id: m.id, kind: 'sys', at: time(m.created_at), text: eventText(m) });
  else if (m.kind === 'in') result.push({ id: m.id, kind: 'in', at: time(m.created_at), text: m.body ?? '' });
  else result.push({ id: m.id, kind: 'out', at: time(m.created_at), text: m.body ?? '', status: m.status ?? 'sending', source: m.source ?? 'manual', by: m.by?.split(/\s+/)[0], template: m.template_name,
    templateKey: m.template_name && m.template_language ? `${m.template_name}:${m.template_language}` : undefined,
    clientRef: m.client_ref, error: m.error_message, retryable: m.status === 'failed' && m.error_code !== 'uncertain' && !m.meta_message_id });
 }
 return result;
}
