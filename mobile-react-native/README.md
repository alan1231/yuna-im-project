# Yuna IM React Native

React Native mobile app for the Yuna IM Go backend. This version mirrors the user-facing Flutter mobile flow:

- create or sign in by display name
- load the stock bot room, friends, and recent conversations
- load message history
- send and receive text messages over WebSocket
- persist the current profile locally

## Architecture

The app uses a lightweight MVVM split:

- `App.js`: View layer, React Native screens/components and styles.
- `src/viewModels/useChatViewModel.js`: ViewModel layer, screen state and user actions.
- `src/services/`: API, WebSocket, and local profile storage.
- `src/models/`: data normalization and chat helpers.
- `src/config/`: runtime API/WebSocket configuration.

## Run

Start MongoDB, Redis, Go, and the web frontend from the repo root:

```bash
docker compose up -d
./scripts/dev.sh
```

Then run the React Native app:

```bash
cd mobile-react-native
npm install
npm run ios
```

By default, the app uses the deployed Render API:

```text
https://yuna-im-project.onrender.com
```

To use a local backend instead, point the app at the computer's LAN IP:

```bash
cp src/config/runtime.local.example.js src/config/runtime.local.js
```

Then edit `src/config/runtime.local.js`:

```js
module.exports = {
  apiHost: '192.168.0.71',
  apiPort: '8080',
}
```

Optional overrides:

- `apiBaseUrl`, full HTTP API URL
- `wsBaseUrl`, full WebSocket URL ending in `/ws`
- `apiHost`, local host override used to build `http://<host>:<port>`
- `apiPort`, default `8080`

Android emulator note: use `apiHost: '10.0.2.2'` when the Go backend runs on the host machine.
