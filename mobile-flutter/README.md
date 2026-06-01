# Yuna IM Mobile

Flutter mobile client for Yuna IM.

This app is user-facing only. It does not implement the admin console.

## Features

- Create or log in by display name.
- Load stock bot room.
- Load friend and conversation list.
- Load recent message history.
- Send and receive realtime text messages through WebSocket.

## Architecture

- `lib/src/models`: data models.
- `lib/src/services`: HTTP, WebSocket, and local profile storage.
- `lib/src/view_models`: simple MVVM state layer.
- `lib/src/screens`: top-level screens.
- `lib/src/widgets`: reusable UI widgets.

State management uses Riverpod. Loading states use shimmer skeleton widgets.

## Run

Start backend services from the repository root first:

```bash
docker compose up -d
./scripts/dev.sh
```

Then run the Flutter app:

```bash
cd mobile-flutter
flutter run
```

For a physical phone, point `API_HOST` to the computer's LAN IP:

```bash
flutter run --dart-define=API_HOST=192.168.0.71
```

Android emulator usually needs:

```bash
flutter run --dart-define=API_HOST=10.0.2.2
```

## Current Scope

The first version intentionally keeps attachments out of mobile. It focuses on text chat and realtime connectivity first.

See [../docs/API_CONTRACT.md](../docs/API_CONTRACT.md) for the backend contract.
