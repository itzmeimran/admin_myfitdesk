import { z } from 'zod';
import { requirePermission } from '@/core/auth/access';
import { createClient } from '@/core/db/server-client';
import { loose } from '@/core/db/loose-client';
import { ButtonLink } from '@/components/ButtonLink';
import { HiddenConversationButton } from './restore-button';
import type { Cursor } from '@/features/whatsapp-inbox/types';

type HiddenRow = { id: string; phone_e164: string; name: string | null; blocked_at: string | null; archived_at: string | null };
export default async function HiddenWhatsAppPage({ searchParams }: { searchParams: Promise<{ at?: string; id?: string }> }) {
 await requirePermission('whatsapp.manage');
 const query = await searchParams;
 const parsed = z.object({ at: z.iso.datetime({ offset: true }), id: z.string().uuid() }).safeParse(query);
 const { data, error } = await loose(await createClient()).rpc('admin_wa_hidden', { p_limit: 50, p_before: parsed.success ? parsed.data : null });
 const result = data as { rows: HiddenRow[]; has_more: boolean; before: Cursor | null } | null;
 return <div className="flex flex-col gap-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-[24px]">Archived &amp; blocked</h1><ButtonLink href="/admin/whatsapp/inbox" variant="secondary" size="sm">Back to inbox</ButtonLink></div>
  <p className="text-[13px] text-mute">Restore archived conversations or unblock a number to receive future messages. Messages dropped while blocked cannot be recovered.</p>
  {error ? <p role="alert">Unable to load hidden conversations. Check that migration 1023 is applied.</p> : null}
  {result?.rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-4 border-[1.5px] border-line p-4"><div className="mr-auto"><b>{row.name ?? row.phone_e164}</b><p className="text-[13px] text-mute">{row.phone_e164} · {row.blocked_at ? 'Blocked' : 'Archived'}</p></div><HiddenConversationButton id={row.id} blocked={Boolean(row.blocked_at)} /></div>)}
  {!error && !result?.rows.length ? <p className="text-mute">No archived or blocked conversations.</p> : null}
  {result?.has_more && result.before ? <ButtonLink href={`/admin/whatsapp/hidden?at=${encodeURIComponent(result.before.at)}&id=${result.before.id}`} variant="secondary" size="sm">Next page</ButtonLink> : null}
 </div>;
}
