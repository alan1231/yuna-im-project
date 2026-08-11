export type AccountMode = 'login' | 'create';

export type ApiUser = {
  user_id: string;
  display_name: string;
};

export type CurrentUser = {
  id: string;
  displayName: string;
  token: string;
};

export type ConversationRecord = {
  conversation_id: string;
  recipient_id: string;
  display_name: string;
  is_friend?: boolean;
  is_group?: boolean;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
};

export type ChatMessage = {
  sender?: string;
  sender_id: string;
  recipient_id?: string;
  conversation_id: string;
  text?: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_size?: number;
  time?: string;
  read_at?: string | null;
};

export const getMessageKey = (message: ChatMessage) =>
  [
    message.sender_id,
    message.recipient_id ?? '',
    message.conversation_id,
    message.time ?? '',
    message.text ?? '',
    message.attachment_name ?? '',
    message.attachment_size ?? 0,
  ].join('|');

export const formatConversationTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
