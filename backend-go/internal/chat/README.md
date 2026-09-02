# Chat Backend Context

This package owns the Go side of the IM system.

## Responsibilities

- Password registration/login and Redis-backed sessions.
- Authenticated chat HTTP APIs: users, friends, friend requests, groups, messages, conversations.
- WebSocket sessions for live chat.
- Shared MongoDB Change Stream hub for real-time event fanout.
- Redis-backed presence and MongoDB presence snapshots.
- Group membership authorization and group read receipts (`read_by`).
- Per-user deleted-conversation hiding.
- Redis Pub/Sub relay for voice/video WebRTC signaling (one-to-one only).
- Redis-backed blackjack sessions, invite/response flow, and expiry handling.
- MongoDB indexes for chat read paths.
- Admin stats, admin user list, and admin-only user deletion endpoints.

## Non-Responsibilities

- Frontend formatting or UI-specific display logic.
- Stock lookup or external finance APIs.
- Long-running bot work.

## Key Files

- `server.go`: HTTP routes, WebSocket lifecycle, Change Stream hub, message history, conversations, group send/read logic, read receipts.
- `presence.go`: Redis connection counts and online TTLs.
- `auth.go`: bcrypt credentials, Redis sessions, Bearer middleware, and one-time WebSocket tickets.
- `blackjack.go`: Redis-backed blackjack state machine and event relay.
- `indexes.go`: MongoDB indexes used by chat and admin queries.
- `config.go`: environment-backed runtime config.
- `admin.go`: admin endpoints for stats, users, deletion, and token gate.
- `models.go`: request and response DTOs.

## Design Notes

- One Go server process should open one MongoDB Change Stream through `changeStreamHub`, then fan events out in memory.
- Each WebSocket client has a bounded send channel so a slow browser does not block the whole hub.
- The frontend sends `active_conversation` control messages over WebSocket so Go can mark the currently open room as read.
- `conversation_id` must be recomputed server-side with `conversationIDFor` / `groupConversationID`; do not trust a client-supplied value for new messages.
- Group messages carry `participant_ids` so the Change Stream hub can fan them out to every member; membership is re-checked on send and on history reads.
- Voice/video signaling and the blackjack game intentionally only work in one-to-one conversations; group conversations reject these message types.
