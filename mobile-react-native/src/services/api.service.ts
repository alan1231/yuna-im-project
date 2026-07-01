import {
  ApiUser,
  ChatMessage,
  ConversationRecord,
  CurrentUser,
  createLocalUserId,
} from '../models/types';

const API_URL = 'https://yuna-im-project.onrender.com';

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const ApiService = {
  wakeBackend() {
    return requestJson<{ status: string; time: string }>(`${API_URL}/health`);
  },

  fetchUsers() {
    return requestJson<ApiUser[]>(`${API_URL}/users`);
  },

  fetchConversations(userId: string) {
    return requestJson<ConversationRecord[]>(
      `${API_URL}/conversations?user_id=${encodeURIComponent(userId)}`,
    );
  },

  fetchMessages(userId: string, conversationId: string) {
    const url = new URL(`${API_URL}/messages`);
    url.searchParams.set('user_id', userId);
    url.searchParams.set('conversation_id', conversationId);
    return requestJson<ChatMessage[]>(url.toString());
  },

  createUser(displayName: string): Promise<ApiUser> {
    return requestJson<ApiUser>(`${API_URL}/users`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: createLocalUserId(),
        display_name: displayName,
      }),
    });
  },

  toCurrentUser(user: ApiUser): CurrentUser {
    return {
      id: user.user_id,
      displayName: user.display_name,
    };
  },
};
