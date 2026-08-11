# Chat Backend Context

This package owns the Go side of the IM system.

## Responsibilities

- Password registration/login and Redis-backed sessions.
- Authenticated chat HTTP APIs: users, friends, friend requests, messages, conversations.
- WebSocket sessions for live chat.
- Shared MongoDB Change Stream hub for real-time event fanout.
- Redis-backed presence and MongoDB presence snapshots.
- MongoDB indexes for chat read paths.
- Read receipts.
- Admin stats, admin user list, and admin-only user deletion endpoints.

## Non-Responsibilities

- Frontend formatting or UI-specific display logic.
- Stock lookup or external finance APIs.
- Long-running bot work.

## Key Files

- `server.go`: HTTP routes, WebSocket lifecycle, Change Stream hub, message history, conversations, read receipts.
- `presence.go`: Redis connection counts and online TTLs.
- `auth.go`: bcrypt credentials, Redis sessions, Bearer middleware, and one-time WebSocket tickets.
- `indexes.go`: MongoDB indexes used by chat and admin queries.
- `config.go`: environment-backed runtime config.
- `admin.go`: admin endpoints for stats, users, deletion, and token gate.
- `models.go`: request and response DTOs.

## Design Notes

- One Go server process should open one MongoDB Change Stream through `changeStreamHub`, then fan events out in memory.
- Each WebSocket client has a bounded send channel so a slow browser does not block the whole hub.
- The frontend sends `active_conversation` control messages over WebSocket so Go can mark the currently open room as read.
- `conversation_id` must be recomputed server-side with `conversationIDFor`; do not trust a client-supplied value for new messages.
