'use server';

import { z } from 'zod';
import { assertPermission, getAdminAccess } from '@/core/auth/access';
import { createClient } from '@/core/db/server-client';
import { createServiceClientForEnvironment } from '@/core/db/service-client';
import { loose } from '@/core/db/loose-client';
import { getActiveAdminEnvironment } from '@/core/env/active-environment';
import { managedWhatsAppConfig } from '@/core/config/whatsapp';
import { approvedTemplates, dispatchManagedMessage, renderTemplate } from '@/core/whatsapp/managed-graph';
import { mapConversation, mapTeam, type Bootstrap, type RawList, type RawThread } from '@/features/whatsapp-inbox/data';
import type { Cursor, InboxFilter, InboxInitial } from '@/features/whatsapp-inbox/types';

const uuid = z.string().uuid();
const cursor = z.object({ at: z.iso.datetime({ offset: true }), id: uuid }).nullable();
const commandSchema = z.discriminatedUnion('command', [
 z.object({ command: z.literal('assign'), input: z.object({ assigneeId: uuid.nullable() }) }),
 z.object({ command: z.enum(['close', 'reopen', 'archive', 'block', 'unblock', 'unread']), input: z.object({}) }),
 z.object({ command: z.literal('read'), input: z.object({ through: z.iso.datetime({ offset: true }) }) }),
 z.object({ command: z.literal('note'), input: z.object({ note: z.string().max(5000), version: z.number().int().min(0) }) }),
 z.object({ command: z.literal('lead'), input: z.object({ contactName: z.string().trim().min(1).max(100), gymName: z.string().trim().min(1).max(160) }) }),
]);
function dbError(error: { code?: string; message: string }) {
 if (['PGRST202', '42P01'].includes(error.code ?? '')) return 'Inbox database setup is pending. Apply migrations 1021, 1022 and 1023 in this environment.';
 if (['P0001', '40001', '42501'].includes(error.code ?? '')) return error.message;
 return 'Unable to update the inbox. Please try again.';
}

export async function loadInbox(filter: InboxFilter = 'all', search = '', before: Cursor | null = null, selectedId: string | null = null) {
 await assertPermission('whatsapp.view');
 const parsed = z.object({ filter: z.enum(['all','unread','open','closed','unassigned']), search: z.string().max(160), before: cursor, selectedId: uuid.nullable() }).safeParse({ filter, search, before, selectedId });
 if (!parsed.success) return { data: null, error: 'Invalid inbox filters.' };
 const { data, error } = await loose(await createClient()).rpc('admin_wa_conversations', { p_filter: filter, p_search: search, p_limit: 50, p_before: before, p_selected: selectedId });
 return { data: error ? null : data as RawList, error: error ? dbError(error) : null };
}

export async function loadInboxThread(id: string, before: Cursor | null = null) {
 await assertPermission('whatsapp.view');
 if (!uuid.safeParse(id).success || !cursor.safeParse(before).success) return { data: null, error: 'Invalid conversation.' };
 const { data, error } = await loose(await createClient()).rpc('admin_wa_messages', { p_conversation_id: id, p_before: before, p_limit: 60 });
 return { data: error ? null : data as RawThread, error: error ? dbError(error) : null };
}

export async function initialInbox(): Promise<InboxInitial> {
 await assertPermission('whatsapp.view');
 const access = (await getAdminAccess())!;
 const environment = await getActiveAdminEnvironment();
 const db = loose(await createClient());
 const [list, bootstrap] = await Promise.all([loadInbox(), db.rpc('admin_wa_bootstrap')]);
 const boot = bootstrap.data as Bootstrap | null;
 let templates: InboxInitial['templates'] = []; let templateError: string | null = null;
 if (boot && managedWhatsAppConfig(environment)) {
  try { templates = await approvedTemplates(environment, boot.allowed_templates); } catch { templateError = 'Approved templates could not be loaded. Text replies are still available inside the reply window.'; }
 }
 return { environment, conversations: list.data?.rows.map(c => mapConversation(c)) ?? [], counts: list.data?.counts ?? { total: 0, open: 0, unread: 0 }, hasMore: list.data?.has_more ?? false,
  team: mapTeam(boot?.team ?? []), templates, currentUserId: access.userId, configured: Boolean(managedWhatsAppConfig(environment)),
  canManage: access.permissions.includes('whatsapp.manage'), canCreateLead: access.permissions.includes('whatsapp.manage') && access.permissions.includes('sales.manage'),
  error: list.error ?? (bootstrap.error ? dbError(bootstrap.error) : null), templateError };
}

export async function inboxCommand(id: string, command: string, input: Record<string, unknown> = {}) {
 await assertPermission('whatsapp.manage');
 const parsed = commandSchema.safeParse({ command, input });
 if (!uuid.safeParse(id).success || !parsed.success) return { error: 'Invalid inbox update.' };
 if (command === 'lead') await assertPermission('sales.manage');
 const { error } = await loose(await createClient()).rpc('admin_wa_command', { p_id: id, p_command: parsed.data.command, p_input: parsed.data.input });
 return { error: error ? dbError(error) : null };
}

export async function sendInboxMessage(input: { conversationId: string; clientRef: string; body: string; templateKey?: string; retry?: boolean }) {
 await assertPermission('whatsapp.manage');
 const parsed = z.object({ conversationId: uuid, clientRef: uuid, body: z.string().trim().min(1).max(4096), templateKey: z.string().max(160).optional(), retry: z.boolean().optional() }).safeParse(input);
 if (!parsed.success) return { id: null, error: 'Message must be 1–4096 characters.' };
 const p = parsed.data; const environment = await getActiveAdminEnvironment();
 if (!managedWhatsAppConfig(environment)) return { id: null, error: 'Managed WhatsApp is not configured for this environment.' };
 const db = loose(await createClient());
 let template: InboxInitial['templates'][number] | undefined;
 let templateContactName = '';
 let body = p.body;
 if (p.templateKey) {
  const { data, error } = await db.rpc('admin_wa_bootstrap');
  if (error) return { id: null, error: dbError(error) };
  try { template = (await approvedTemplates(environment, (data as Bootstrap).allowed_templates)).find(t => t.key === p.templateKey); }
  catch { return { id: null, error: 'Could not verify this template. Please try again.' }; }
  if (!template) return { id: null, error: 'This template is no longer approved or allowed.' };
  const thread = await loadInboxThread(p.conversationId);
  if (!thread.data) return { id: null, error: thread.error ?? 'Conversation unavailable.' };
  templateContactName = thread.data.conversation.name ?? thread.data.conversation.profile_name ?? '';
  body = renderTemplate(template, templateContactName);
  if (p.retry && body !== p.body) return { id: null, error: 'The template or contact changed. Send a new template instead.' };
 }
 const { data, error } = await db.rpc('admin_wa_prepare_send', { p_conversation_id: p.conversationId, p_client_ref: p.clientRef, p_body: body,
  p_template_name: template?.name ?? null, p_template_language: template?.language ?? null, p_retry: Boolean(p.retry) });
 if (error) return { id: null, error: dbError(error) };
 const reservation = data as { dispatch: boolean; id: string; attempt: string; phone: string; name: string; body: string; template: string | null; language: string | null; error?: string };
 if (!reservation.dispatch) return { id: reservation.id, error: reservation.error ?? null };
 // The DB's immutable retry row, rather than client input, determines what goes to Graph.
 if ((reservation.template ?? null) !== (template?.name ?? null) || (reservation.language ?? null) !== (template?.language ?? null)) return { id: reservation.id, error: 'Template mismatch. Delivery is paused; reload the thread.' };
 const outcome = await dispatchManagedMessage(environment, reservation, template, templateContactName);
 const service = loose(await createServiceClientForEnvironment(environment));
 const saved = await service.rpc('platform_wa_finish_send', { p_id: reservation.id, p_attempt: reservation.attempt, p_meta_id: outcome.metaId, p_error_code: outcome.errorCode });
 if (saved.error || outcome.errorCode === 'uncertain') return { id: reservation.id, error: 'Waiting for delivery confirmation. This message will not be sent again automatically.' };
 return { id: reservation.id, error: outcome.errorCode ? 'WhatsApp could not send this message. Reload and retry.' : null };
}
