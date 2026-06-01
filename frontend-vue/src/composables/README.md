# Vue Composables Context

This directory owns shared Vue state and screen-level behavior.

## Responsibilities

- Keep API/WebSocket orchestration out of presentational components.
- Own chat screen state such as rooms, active room, messages, friend requests, read receipts, and connection status.
- Normalize backend and bot message shapes before rendering.
- Keep frontend memory bounded for long-running sessions.

## Key Files

- `useChatViewModel.js`: chat room state, in-memory message cache, WebSocket lifecycle, friend flows, history loading, and send flow.
- `useAdminViewModel.js`: admin dashboard state and API calls.

## Chat Cache Rules

- Message caches are in memory only; they are cleared by a browser refresh.
- Durable chat history lives in MongoDB and is loaded through `/messages`.
- Each conversation keeps at most `MAX_MESSAGES_PER_CONVERSATION` messages.
- The client keeps at most `MAX_CACHED_CONVERSATIONS` conversation caches.
- The active conversation and stock bot conversation are protected from cache eviction.
- De-duplication keys must be rebuilt when old messages are trimmed.

## Attachment Rules

- Attachments are available only in normal user-to-user chats.
- The stock bot room is text-only because it expects command-like stock symbols.
- Current attachments are stored as small data URLs in message documents, so keep the size limit conservative.
- Images larger than the limit are compressed client-side before attachment when possible.
- Non-image files cannot be reliably compressed in the browser and must already fit the size limit.
- Image attachments render inline; other file types render as a file link.
- A production version should upload files to object storage and persist only metadata plus a URL in MongoDB.

## WebSocket Rules

- Keep one WebSocket per user session.
- Do not reconnect on every room switch.
- Send an `active_conversation` control message when the selected room changes.
- Normal chat sends should include only the intended recipient and text; the Go backend owns sender identity and `conversation_id` recomputation.
