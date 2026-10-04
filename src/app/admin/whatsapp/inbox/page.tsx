import { InboxView } from "@/features/whatsapp-inbox/inbox-view";
import { initialInbox } from './actions';

export const metadata = { title: "WhatsApp Inbox · MyFitDesk Admin" };

export default async function WhatsAppInboxPage() {
  const initial = await initialInbox();
  return <InboxView key={`${initial.environment}:${initial.currentUserId}`} initial={initial} />;
}
