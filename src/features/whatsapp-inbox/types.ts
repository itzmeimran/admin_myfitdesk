/** Shared presentation contract. ISO instants and version tokens accompany
 * IST labels; writes never parse a formatted time or a countdown label. */

export type TeamMember = {
  id: string;
  /** Two-letter avatar initials. */
  ini: string;
  name: string;
  /** First name, shown beside the avatar in the chat header on wide screens. */
  short: string;
};

export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

/** Who produced an outbound message: a person typing, an automation (a
 * template fired by a platform event) or the AI assistant. */
export type MessageSource = "manual" | "auto" | "ai";

export type Message =
  | { id: string; kind: "day"; text: string }
  | { id: string; kind: "sys"; text: string; at: string }
  | { id: string; kind: "in"; text: string; at: string }
  | {
      id: string;
      kind: "out";
      text: string;
      at: string;
      status: MessageStatus;
      source: MessageSource;
      /** First name of the sender when `source === "manual"`. */
      by?: string;
      /** Approved-template key when the message was sent as a template. */
      template?: string;
      templateKey?: string;
      clientRef?: string;
      error?: string;
      retryable?: boolean;
    };

export type OutboundMessage = Extract<Message, { kind: "out" }>;

export type ConversationStatus = "open" | "closed";

export type CrmLink = { id?: string; lead: string; stage: string };

export type Conversation = {
  id: string;
  /** Null for a number that isn't in contacts yet. */
  name: string | null;
  org: string;
  phone: string;
  assigneeId: string | null;
  status: ConversationStatus;
  /** Remaining 24-hour reply window ("18h 42m"), or null once it has closed. */
  windowLeft: string | null;
  crm: CrmLink | null;
  /** "First contacted" as displayed. */
  first: string;
  /** Last-activity label shown in the list ("09:41", "Wed"). */
  time: string;
  unread: number;
  note: string;
  messages: Message[];
  windowEndsAt?: string | null;
  lastMessageAt?: string;
  preview?: string;
  profileName?: string | null;
  noteVersion?: number;
};

export type MessageTemplate = {
  key: string;
  category: "Utility" | "Marketing";
  /** Body with a `{n}` placeholder for the contact's first name. */
  body: string;
  name?: string;
  language?: string;
  parameter?: string | null;
};

export type Cursor = { at: string; id: string };
export type InboxCounts = { total: number; open: number; unread: number };
export type InboxInitial = { environment: 'dev' | 'prod'; conversations: Conversation[]; team: TeamMember[]; templates: MessageTemplate[]; currentUserId: string;
  counts: InboxCounts; hasMore: boolean; canManage: boolean; canCreateLead: boolean; configured: boolean; error: string | null; templateError: string | null };

export type InboxFilter = "all" | "unread" | "open" | "closed" | "unassigned";
