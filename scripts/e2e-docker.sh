#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Cricket Scoring — Docker-backed E2E runner
#
# Starts Postgres + Redis via docker compose, migrates/seeds the DB, boots the
# API, and runs npm run test:e2e:all (smoke + phase2 + architecture).
#
# Requires: Docker, Node ≥ 20, curl
###############################################################################

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PID=""

log() { echo "[e2e-docker] $*"; }

cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    log "Stopping API (pid $API_PID)..."
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1" label="$2" attempts="${3:-30}" delay="${4:-2}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf --max-time 3 "$url" >/dev/null 2>&1; then
      log "$label is ready"
      return 0
    fi
    sleep "$delay"
  done
  log "ERROR: $label did not become ready at $url"
  return 1
}

wait_for_compose_healthy() {
  local service="$1" attempts="${2:-30}" delay="${3:-2}"
  for _ in $(seq 1 "$attempts"); do
    status=$(docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}healthy{{end}}" "cricket_${service}" 2>/dev/null || echo "missing")
    if [ "$status" = "healthy" ]; then
      log "$service container is healthy"
      return 0
    fi
    sleep "$delay"
  done
  log "ERROR: $service did not become healthy in time (last status: $status)"
  docker compose ps "$service" || true
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  log "ERROR: docker is not installed or not on PATH"
  exit 1
fi

if [ ! -f apps/api/.env ]; then
  log "Creating apps/api/.env from .env.example"
  cp apps/api/.env.example apps/api/.env
fi

log "Starting docker compose services: postgres redis"
docker compose up -d postgres redis

wait_for_compose_healthy postgres
wait_for_compose_healthy redis

export DATABASE_URL="${DATABASE_URL:-postgres://cricket:cricket_dev@localhost:5433/cricket_scoring}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-in-production}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-dev-refresh-secret-change-in-production}"
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-3001}"
export HOST="${HOST:-0.0.0.0}"

log "Running database migrations..."
npm run db:migrate

log "Seeding admin/scorer users (required for role-gated E2E routes)..."
npm run db:seed

log "Building API..."
npx turbo build --filter=@cricket/api

log "Starting API on http://localhost:${PORT}..."
npm run start --workspace=@cricket/api &
API_PID=$!

wait_for_url "http://localhost:${PORT}/health" "API"

log "Running full E2E suite (test:e2e:all)..."
npm run test:e2e:all

log "E2E suite finished successfully"
