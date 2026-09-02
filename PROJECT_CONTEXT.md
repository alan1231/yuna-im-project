# Project Context

## Goal

Neon Ghost is a real-time chat project that combines a React chat UI, a Go HTTP/WebSocket backend, MongoDB persistence, Redis presence, WebRTC voice/video signaling, and a blackjack mini-game.

The current priority is a stable local/demo-grade IM experience with clear paths toward production hardening.

## Architecture

- `frontend-react`: React app for account setup, chat, friend management, and the admin console.
- `backend-go`: HTTP API, WebSocket sessions, shared MongoDB Change Stream hub, Redis-backed presence, read receipts, and admin endpoints.
- MongoDB: Durable storage for users, messages, friends, and friend requests.
- Redis: Short-lived online presence and WebSocket connection counts.

## Runtime Assumptions

- MongoDB must run as a replica set because Go depends on Change Streams.
- Go backend defaults to `:8080`.
- React uses Vite for local development.
- Local development starts all app processes with `./scripts/dev.sh`; MongoDB and Redis still need to be running.

## Important Data Flows

- User sends message in React through WebSocket.
- Go trusts the WebSocket `user_id` query parameter as sender identity for now, recomputes `conversation_id`, and writes the message to MongoDB.
- Go shared Change Stream hub watches MongoDB once per backend process and fans events out to matching WebSocket clients.
- React keeps bounded in-memory message caches and reloads persisted history from `/messages` when needed.

## Current Priorities

- Keep long-running frontend sessions bounded in memory.
- Keep backend real-time fanout efficient as users/tabs increase.
- Preserve simple local development.
- Add stronger authentication before treating this as production-ready.

## Known Gaps

- User identity is client-controlled through `user_id`; production needs sessions or JWT.
- Admin auth is token-based and intentionally lightweight.
- Conversation list is still computed from recent messages instead of a dedicated summary collection.
- Frontend has no lint setup yet; unit tests run through Vitest.
