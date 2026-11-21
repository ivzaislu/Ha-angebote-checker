#!/usr/bin/env bash
# Update an existing checkout; abort on local changes and do not delete database data.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/angebote-checker}"
APP_USER="${APP_USER:-angebote}"
BRANCH="${BRANCH:-feature/self-learning-product-catalog}"
SERVICE_NAME="${SERVICE_NAME:-angebote-checker}"
if [[ "${EUID}" -ne 0 ]]; then echo "Run as root: sudo bash deploy/update.sh" >&2; exit 1; fi
[[ -d "$APP_DIR/.git" ]] || { echo "No checkout in $APP_DIR" >&2; exit 1; }
[[ -f "/etc/${SERVICE_NAME}.env" ]] || { echo "Missing /etc/${SERVICE_NAME}.env" >&2; exit 1; }
grep -Eq '^DATABASE_URL=.+$' "/etc/${SERVICE_NAME}.env" || { echo "DATABASE_URL required" >&2; exit 1; }
command -v runuser >/dev/null
cd "$APP_DIR"
if [[ -n "$(runuser -u "$APP_USER" -- git status --porcelain)" ]]; then echo "Refusing to overwrite local changes" >&2; exit 1; fi
runuser -u "$APP_USER" -- git fetch origin "$BRANCH"
runuser -u "$APP_USER" -- git checkout "$BRANCH"
runuser -u "$APP_USER" -- git merge --ff-only "origin/$BRANCH"
cd webapp
# The existing lockfile is inconsistent, so npm ci is not reliable yet.
runuser -u "$APP_USER" -- npm install --no-save --package-lock=false
# Build runs migrations via npm's build script; environment must be loaded.
set -a
# shellcheck disable=SC1090
source "/etc/${SERVICE_NAME}.env"
set +a
[[ -n "${DATABASE_URL:-}" ]] || { echo "DATABASE_URL empty" >&2; exit 1; }
runuser -u "$APP_USER" -- env DATABASE_URL="$DATABASE_URL" npm run build
systemctl restart "$SERVICE_NAME"
systemctl is-active --quiet "$SERVICE_NAME" || { echo "Service failed. Check journalctl -u $SERVICE_NAME" >&2; exit 1; }
echo "Updated to $(runuser -u "$APP_USER" -- git -C "$APP_DIR" rev-parse --short HEAD)"
