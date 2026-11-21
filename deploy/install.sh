#!/usr/bin/env bash
# Ubuntu/Debian server with systemd, Node.js 22+, git and npm installed.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/angebote-checker}"
APP_USER="${APP_USER:-angebote}"
BRANCH="${BRANCH:-feature/self-learning-product-catalog}"
REPO_URL="${REPO_URL:-https://github.com/ivzaislu/Ha-angebote-checker.git}"
SERVICE_NAME="${SERVICE_NAME:-angebote-checker}"
if [[ "${EUID}" -ne 0 ]]; then echo "Run as root: sudo bash deploy/install.sh" >&2; exit 1; fi
for cmd in git npm node systemctl runuser; do command -v "$cmd" >/dev/null || { echo "Missing: $cmd" >&2; exit 1; }; done
node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo "Node.js 22+ required" >&2; exit 1; }
id "$APP_USER" &>/dev/null || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
if [[ -e "$APP_DIR" && ! -d "$APP_DIR/.git" ]]; then echo "Refusing non-git directory: $APP_DIR" >&2; exit 1; fi
if [[ ! -d "$APP_DIR/.git" ]]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
fi
ENV_FILE="/etc/${SERVICE_NAME}.env"
if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  printf '# Set a persistent PostgreSQL connection string before starting.\nDATABASE_URL=\nPORT=8080\nHOST=127.0.0.1\n' > "$ENV_FILE"
  echo "Created $ENV_FILE. Set DATABASE_URL and rerun this installer." >&2
  exit 2
fi
if ! grep -Eq '^DATABASE_URL=.+$' "$ENV_FILE"; then echo "Set DATABASE_URL in $ENV_FILE first" >&2; exit 2; fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Angebote Checker web app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR/webapp
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) .output/server/index.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/webapp
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
APP_DIR="$APP_DIR" APP_USER="$APP_USER" BRANCH="$BRANCH" SERVICE_NAME="$SERVICE_NAME" bash "$APP_DIR/deploy/update.sh"
systemctl enable "$SERVICE_NAME"
echo "Installed. Configure an HTTPS reverse proxy to http://127.0.0.1:8080."
