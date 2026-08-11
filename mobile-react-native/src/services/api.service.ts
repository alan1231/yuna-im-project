import {
  ApiUser,
  ChatMessage,
  ConversationRecord,
  CurrentUser,
} from '../models/types';

const API_URL = 'https://yuna-im-api.vercel.app';
let authToken = '';

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function requestOk(input: string, init?: RequestInit): Promise<void> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
}

export const ApiService = {
  setAuthToken(token: string) {
    authToken = token;
  },

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

  register(displayName: string, password: string) {
    return requestJson<{ token: string; user: ApiUser }>(`${API_URL}/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName, password }),
    });
  },

  login(displayName: string, password: string) {
    return requestJson<{ token: string; user: ApiUser }>(`${API_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ display_name: displayName, password }),
    });
  },

  fetchCurrentUser() {
    return requestJson<ApiUser>(`${API_URL}/auth/me`);
  },

  logout() {
    return requestOk(`${API_URL}/auth/logout`, { method: 'POST' });
  },

  createWebSocketTicket() {
    return requestJson<{ ticket: string }>(`${API_URL}/auth/ws-ticket`, { method: 'POST' });
  },

  toCurrentUser(user: ApiUser, token: string): CurrentUser {
    return {
      id: user.user_id,
      displayName: user.display_name,
      token,
    };
  },
};
