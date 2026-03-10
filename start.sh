#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Supply Chain Command Center — one-command launcher
# Usage: ./start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $*"; }
fail() { echo -e "${RED}  ✗${RESET}  $*" >&2; }
step() { echo -e "\n${BOLD}${BLUE}[$1]${RESET} $2"; }

APP_URL="http://localhost:8080"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}   Supply Chain Command Center${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Step 1: Docker ────────────────────────────────────────────────────────────
step "1/3" "Checking Docker"

if ! command -v docker &>/dev/null; then
  fail "Docker is not installed."
  echo ""
  echo -e "  Download Docker Desktop: ${BOLD}https://www.docker.com/products/docker-desktop/${RESET}"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  info "Docker Desktop is not running — starting it…"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a Docker
  fi
  echo -n "     Waiting for Docker"
  for i in $(seq 1 30); do
    if docker info &>/dev/null 2>&1; then break; fi
    echo -n "."; sleep 2
  done
  echo ""
  if ! docker info &>/dev/null 2>&1; then
    fail "Docker did not start. Please open Docker Desktop manually and try again."
    exit 1
  fi
fi
ok "Docker is running"

# ── Step 2: API keys hint ─────────────────────────────────────────────────────
step "2/3" "Checking configuration"

cd "$SCRIPT_DIR"

if [[ -f ".env" ]]; then
  ok ".env file found — API keys will be loaded"
else
  warn "No .env file found — Claude/OpenAI features will be unavailable"
  echo -e "     Copy ${BOLD}.env.example${RESET} to ${BOLD}.env${RESET} and add your API keys to enable them."
  echo -e "     The local AI (Ollama + Llama) still works without any keys."
fi

# ── Step 3: Build & Start ─────────────────────────────────────────────────────
step "3/3" "Starting all services"

info "Bringing down any stale containers…"
docker compose down --remove-orphans &>/dev/null || true

info "Building images and starting services (Ollama + Backend + Frontend)…"
info "The AI model (~1 GB) will download automatically in the background on first run."
echo ""

if ! docker compose up --build -d 2>&1; then
  fail "docker compose failed. Check the output above."
  exit 1
fi

# Wait for ready
echo -n "     Waiting for app to be ready"
READY=false
for i in $(seq 1 40); do
  if curl -sf "http://localhost:8000/health" &>/dev/null && \
     curl -sf "http://localhost:8080" &>/dev/null; then
    READY=true; break
  fi
  echo -n "."; sleep 2
done
echo ""

if $READY; then
  ok "Application is ready!"
else
  warn "Services may still be initialising — try opening the app in a few seconds"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}   App is live at: ${APP_URL}${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Dashboard${RESET}  →  ${APP_URL}"
echo -e "  ${BOLD}API docs${RESET}   →  http://localhost:8000/docs"
echo -e "  ${BOLD}AI status${RESET}  →  http://localhost:8000/ai/status"
echo ""
echo -e "  ${YELLOW}Note:${RESET} The AI model downloads in the background on first run."
echo -e "  Check progress: ${BOLD}docker compose logs ollama${RESET}"
echo ""
echo -e "  To stop:   ${BOLD}./stop.sh${RESET}"
echo -e "  To logs:   ${BOLD}docker compose logs -f${RESET}"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$APP_URL" 2>/dev/null || true
fi
