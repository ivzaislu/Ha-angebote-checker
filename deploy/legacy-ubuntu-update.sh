#!/usr/bin/env bash
# Legacy Ubuntu 18.04: no host Node.js or local build required.
set -Eeuo pipefail
IMAGE="${IMAGE:-ghcr.io/ivzaislu/ha-angebote-checker:vps}"
NAME="${NAME:-angebote-checker}"
ENV_FILE="${ENV_FILE:-/etc/angebote-checker-container.env}"
PORT="${PORT:-8080}"
[[ "$EUID" -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is not installed. Check kernel and Docker compatibility before proceeding." >&2; exit 1; }
docker info >/dev/null || { echo "Docker daemon unavailable" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE (DATABASE_URL=postgresql://...)" >&2; exit 1; }
grep -Eq '^DATABASE_URL=.+$' "$ENV_FILE" || { echo "DATABASE_URL must be set in $ENV_FILE" >&2; exit 1; }
if [[ "$(stat -c %a "$ENV_FILE")" != 600 ]]; then echo "Set chmod 600 $ENV_FILE" >&2; exit 1; fi
docker pull "$IMAGE"
# Migrate before replacing the running container. Back up DB before running this script.
docker run --rm --env-file "$ENV_FILE" --entrypoint node "$IMAGE" scripts/migrate.mjs
OLD_IMAGE=""
if docker container inspect "$NAME" >/dev/null 2>&1; then
  OLD_IMAGE="$(docker inspect --format '{{.Image}}' "$NAME")"
  docker rename "$NAME" "${NAME}-previous"
  docker stop "${NAME}-previous" >/dev/null
fi
if ! docker run -d --name "$NAME" --restart unless-stopped --memory 640m --memory-swap 896m --cpus 1 -p "127.0.0.1:${PORT}:8080" --env-file "$ENV_FILE" "$IMAGE"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [[ -n "$OLD_IMAGE" ]]; then docker rename "${NAME}-previous" "$NAME"; docker start "$NAME"; fi
  exit 1
fi
sleep 5
if [[ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != "true" ]]; then
  echo "New container stopped; restoring previous container" >&2
  docker logs --tail 60 "$NAME" >&2 || true
  docker rm -f "$NAME"
  if [[ -n "$OLD_IMAGE" ]]; then docker rename "${NAME}-previous" "$NAME"; docker start "$NAME"; fi
  exit 1
fi
docker rm -f "${NAME}-previous" >/dev/null 2>&1 || true
echo "Running $IMAGE on 127.0.0.1:$PORT"
