#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Supply Chain Command Center — one-command launcher
# Usage: ./start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET}  $*"; }
fail() { echo -e "${RED}  ✗${RESET}  $*" >&2; }
step() { echo -e "\n${BOLD}${BLUE}[$1]${RESET} $2"; }

APP_URL="http://localhost:8080"
MODEL="llama3.2:1b"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}   Supply Chain Command Center${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Step 1: Docker ────────────────────────────────────────────────────────────
step "1/4" "Checking Docker"

if ! command -v docker &>/dev/null; then
  fail "Docker is not installed."
  echo ""
  echo -e "  Install Docker Desktop from: ${BOLD}https://www.docker.com/products/docker-desktop/${RESET}"
  echo -e "  Then re-run this script."
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
    echo -n "."
    sleep 2
  done
  echo ""
  if ! docker info &>/dev/null 2>&1; then
    fail "Docker did not start in time. Please open Docker Desktop manually and try again."
    exit 1
  fi
fi
ok "Docker is running"

# ── Step 2: Ollama ────────────────────────────────────────────────────────────
step "2/4" "Checking Ollama (local AI engine)"

if ! command -v ollama &>/dev/null; then
  warn "Ollama is not installed — AI features will be disabled."
  echo ""
  echo -e "  To enable AI: install from ${BOLD}https://ollama.com${RESET}"
  echo -e "  Then run: ${BOLD}ollama pull ${MODEL}${RESET}"
  echo ""
  OLLAMA_OK=false
else
  OLLAMA_OK=true
fi

if $OLLAMA_OK; then
  if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
    info "Starting Ollama server…"
    ollama serve &>/dev/null &
    disown
    sleep 3
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
      ok "Ollama started"
    else
      warn "Ollama did not start — AI features may be unavailable"
      OLLAMA_OK=false
    fi
  else
    ok "Ollama is running"
  fi
fi

if $OLLAMA_OK; then
  if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
    info "Downloading AI model ${MODEL} (first time only, ~1 GB)…"
    echo ""
    ollama pull "$MODEL"
    echo ""
    ok "Model ${MODEL} ready"
  else
    ok "Model ${MODEL} already downloaded"
  fi
fi

# ── Step 3: Build & Start ─────────────────────────────────────────────────────
step "3/4" "Starting application (building if needed)"

cd "$SCRIPT_DIR"

# Bring down any stale containers cleanly
docker compose down --remove-orphans &>/dev/null || true

info "Building and starting services…"
if docker compose up --build -d 2>&1; then
  ok "Services started"
else
  fail "docker compose failed. Check the output above."
  exit 1
fi

# ── Step 4: Wait for healthy ──────────────────────────────────────────────────
step "4/4" "Waiting for app to be ready"

echo -n "     Checking"
READY=false
for i in $(seq 1 30); do
  if curl -sf "http://localhost:8000/health" &>/dev/null && \
     curl -sf "http://localhost:8080" &>/dev/null; then
    READY=true
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

if $READY; then
  ok "Application is ready!"
else
  warn "Services may still be starting — try opening the app in a few seconds"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}   App is live at: ${APP_URL}${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Dashboard${RESET}  →  ${APP_URL}"
echo -e "  ${BOLD}API docs${RESET}   →  http://localhost:8000/docs"
if $OLLAMA_OK; then
  echo -e "  ${BOLD}AI model${RESET}   →  ${MODEL} (running locally)"
fi
echo ""
echo -e "  To stop:   ${BOLD}./stop.sh${RESET}"
echo -e "  To logs:   ${BOLD}docker compose logs -f${RESET}"
echo ""

# Open browser (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$APP_URL" 2>/dev/null || true
fi
