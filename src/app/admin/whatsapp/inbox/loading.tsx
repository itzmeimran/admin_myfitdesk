import { ChatSkeleton } from "@/features/whatsapp-inbox/chat-pane";
import { ConversationListSkeleton } from "@/features/whatsapp-inbox/conversation-list";

export default function Loading() {
  return (
    <div className="flex h-[calc(100dvh-12.25rem)] min-h-[520px] overflow-hidden border-[1.5px] border-ink bg-paper md:h-[calc(100dvh-9rem)]">
      <div className="w-full flex-shrink-0 border-line lg:w-[288px] lg:border-r xl:w-[340px]">
        <ConversationListSkeleton />
      </div>
      <div className="hidden min-w-0 flex-1 lg:flex">
        <ChatSkeleton />
      </div>
    </div>
  );
}
