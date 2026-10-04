import 'server-only';
import { managedWhatsAppConfig } from '@/core/config/whatsapp';
import type { AdminEnvironment } from '@/core/config/environments';
import type { MessageTemplate } from '@/features/whatsapp-inbox/types';

type GraphTemplate = { name: string; language: string; status: string; category: string; components: { type: string; text?: string; buttons?: unknown[] }[] };
export type AllowedTemplate = { name: string; language: string };

function config(environment: AdminEnvironment) {
  const value = managedWhatsAppConfig(environment);
  if (!value) throw new Error('Managed WhatsApp is not configured for this environment.');
  return value;
}

/** MVP supports text-only templates with no parameters or one first-name body parameter.
 * Media headers and buttons need a dedicated parameter form and are excluded. */
export function mapApprovedTemplate(t: GraphTemplate, allowed: AllowedTemplate[]): MessageTemplate | null {
  if (t.status !== 'APPROVED' || !allowed.some(a => a.name === t.name && a.language === t.language)) return null;
  if (t.category !== 'UTILITY' && t.category !== 'MARKETING') return null;
  if (t.components.some(c => c.type !== 'BODY' && c.type !== 'FOOTER')) return null;
  const body = t.components.find(c => c.type === 'BODY')?.text;
  if (!body) return null;
  const variables = [...new Set([...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1]))];
  if (variables.length > 1 || (variables.length === 1 && !['1', 'first_name', 'name'].includes(variables[0]))) return null;
  return { key: `${t.name}:${t.language}`, name: t.name, language: t.language, parameter: variables[0] ?? null,
    category: t.category === 'UTILITY' ? 'Utility' : 'Marketing', body: body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, '{n}') };
}

export async function approvedTemplates(environment: AdminEnvironment, allowed: AllowedTemplate[]): Promise<MessageTemplate[]> {
  if (!allowed.length) return [];
  const c = config(environment);
  const result: MessageTemplate[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`https://graph.facebook.com/${c.version}/${c.wabaId}/message_templates`);
    url.searchParams.set('fields', 'name,language,status,category,components');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${c.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Could not verify approved WhatsApp templates.');
    const payload = await response.json() as { data?: GraphTemplate[]; paging?: { next?: string; cursors?: { after?: string } } };
    for (const raw of payload.data ?? []) { const template = mapApprovedTemplate(raw, allowed); if (template) result.push(template); }
    if (!payload.paging?.next) return result;
    after = payload.paging.cursors?.after;
    if (!after) break;
  }
  throw new Error('Could not load the complete template catalogue.');
}

export function renderTemplate(t: MessageTemplate, name: string) { return t.body.replaceAll('{n}', name.trim().split(/\s+/)[0] || 'there'); }

/** Never auto-retry an HTTP request: Graph does not deduplicate our client_ref. */
export async function dispatchManagedMessage(environment: AdminEnvironment, message: { id: string; phone: string; body: string }, template?: MessageTemplate, name = '') {
  const c = config(environment);
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const content = template ? {
    type: 'template', template: { name: template.name, language: { code: template.language },
      ...(template.parameter ? { components: [{ type: 'body', parameters: [{ type: 'text', text: firstName,
        ...(template.parameter !== '1' ? { parameter_name: template.parameter } : {}) }] }] } : {}) },
  } : { type: 'text', text: { body: message.body, preview_url: false } };
  try {
    const response = await fetch(`https://graph.facebook.com/${c.version}/${c.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: message.phone.replace(/^\+/, ''), biz_opaque_callback_data: `wa-inbox:${message.id}`, ...content }),
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
    const payload = await response.json() as { messages?: { id: string }[]; error?: { code?: number } };
    if (response.ok && payload.messages?.[0]?.id) return { metaId: payload.messages[0].id, errorCode: null };
    // Only a structured Graph rejection proves no message was accepted.
    return { metaId: null, errorCode: response.status < 500 && payload.error?.code ? String(payload.error.code) : 'uncertain' };
  } catch {
    return { metaId: null, errorCode: 'uncertain' };
  }
}
