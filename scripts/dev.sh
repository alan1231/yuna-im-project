#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$env_file"
    set +a
  fi
}

# Load backend secrets (e.g. MongoDB Atlas + Upstash Redis) for local development.
# Create backend-go/.env from backend-go/env.example and fill in your cloud values.
load_env_file "$ROOT_DIR/backend-go/.env"

cleanup() {
  echo
  echo "Stopping dev services..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait >/dev/null 2>&1 || true
}

prefix() {
  local name="$1"
  sed "s/^/[$name] /"
}

start_service() {
  local name="$1"
  local dir="$2"
  shift 2

  (
    cd "$dir"
    "$@" 2>&1 | prefix "$name"
  ) &
  PIDS+=("$!")
}

trap cleanup EXIT INT TERM

start_service "go" "$ROOT_DIR/backend-go" go run .
start_service "react" "$ROOT_DIR/frontend-react" npm run dev -- --host 0.0.0.0

echo "Dev services started."
echo "React will print its local and network URLs below. Press Ctrl+C to stop all services."

wait
