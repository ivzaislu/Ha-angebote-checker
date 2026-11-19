#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$EUID" -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
command -v docker >/dev/null || { echo "Install a Docker Engine version compatible with this Ubuntu 18.04 kernel first. This script will not modify system repositories." >&2; exit 1; }
docker info >/dev/null || { echo "Docker daemon is not running" >&2; exit 1; }
ENV_FILE="${ENV_FILE:-/etc/angebote-checker-container.env}"
if [[ ! -e "$ENV_FILE" ]]; then
  umask 077
  printf 'DATABASE_URL=\n' > "$ENV_FILE"
  echo "Created $ENV_FILE; enter PostgreSQL URL and rerun." >&2
  exit 2
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/legacy-ubuntu-update.sh"
