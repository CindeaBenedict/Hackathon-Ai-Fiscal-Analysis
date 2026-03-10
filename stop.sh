#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Supply Chain Command Center — stop all services
# Usage: ./stop.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}Stopping Supply Chain Command Center…${RESET}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

docker compose down --remove-orphans

echo -e "${GREEN}  ✓  All services stopped.${RESET}"
echo ""
