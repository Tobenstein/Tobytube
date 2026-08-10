#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
port="${PORT:-8092}"
url="http://127.0.0.1:${port}/"

cd "$project_dir"

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v gio >/dev/null 2>&1; then
    gio open "$url" >/dev/null 2>&1 || true
  fi
}

(
  for _ in {1..40}; do
    if curl --silent --fail --output /dev/null "$url"; then
      open_browser
      exit 0
    fi
    sleep 0.25
  done
) &

echo "Tobytube launching at $url"
echo "Press Ctrl+C in this window to stop the service."
exec node scripts/tobytube-server.mjs
