# ADR 0001: Shared MongoDB Change Stream Hub

## Status

Accepted

## Context

The original WebSocket implementation opened one MongoDB Change Stream per WebSocket connection. That kept the implementation direct, but duplicated watcher work for every browser tab and active user.

As usage grows, this model increases MongoDB stream count, goroutine count, and duplicate event filtering work.

## Decision

Use one shared MongoDB Change Stream per Go server process. The backend watches relevant collections once, converts changes into WebSocket events, and fans those events out to connected clients by user id.

Each WebSocket client registers with the hub and receives matching events through a bounded channel. Room switches are sent from the frontend as `active_conversation` control messages so the backend can still mark the currently open conversation as read.

## Consequences

Benefits:

- Lower MongoDB resource usage.
- Less duplicated watcher work.
- Better behavior when one user opens multiple browser tabs.
- A clearer place to add future fanout rules.

Tradeoffs:

- More in-memory routing logic in Go.
- Client cleanup matters; channels must be closed on disconnect.
- In a multi-process deployment, each backend process still has its own Change Stream. Cross-process fanout would need Redis pub/sub, Mongo-backed routing, or sticky WebSocket sessions.

