'use client';
import { useConfirmedTransition } from '@/components/use-confirmed-transition';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { inboxCommand } from '../inbox/actions';
export function HiddenConversationButton({ id, blocked }: { id: string; blocked: boolean }) {
 const [pending, start] = useConfirmedTransition(blocked?'Unblock this number and allow future incoming messages?':'Restore this archived conversation?'); const router = useRouter(); const toast = useToast();
 return <Button variant="secondary" size="sm" pending={pending} disabled={pending} onClick={() => start(async () => {
  try { const result = await inboxCommand(id, blocked ? 'unblock' : 'reopen'); if (result.error) toast.error(result.error); else router.refresh(); }
  catch { toast.error('Unable to restore this conversation. Please try again.'); }
 })}>{blocked ? 'Unblock number' : 'Restore conversation'}</Button>;
}
