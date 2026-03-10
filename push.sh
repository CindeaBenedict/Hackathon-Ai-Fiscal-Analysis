#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# push.sh — push to GitLab (origin) and/or GitHub
# Usage:
#   ./push.sh          → push to both GitLab + GitHub
#   ./push.sh gitlab   → push to GitLab only
#   ./push.sh github   → push to GitHub only
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}  ✓${RESET}  $*"; }
info() { echo -e "${CYAN}  →${RESET}  $*"; }
fail() { echo -e "${RED}  ✗${RESET}  $*"; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
TARGET="${1:-both}"

echo ""
echo -e "${BOLD}${CYAN}  Pushing branch: ${BRANCH}${RESET}"
echo ""

push_to() {
  local remote="$1"
  local url
  url=$(git remote get-url "$remote" 2>/dev/null || echo "not configured")

  if [[ "$url" == "not configured" ]]; then
    fail "Remote '$remote' is not configured."
    return 1
  fi

  info "Pushing to ${remote} (${url})…"
  if git push "$remote" "$BRANCH" 2>&1; then
    ok "Pushed to ${remote}"
  else
    fail "Push to ${remote} failed"
    return 1
  fi
}

case "$TARGET" in
  gitlab)
    push_to origin
    ;;
  github)
    push_to github
    ;;
  both|*)
    push_to origin
    echo ""
    push_to github
    ;;
esac

echo ""
echo -e "${GREEN}  Done.${RESET}"
echo ""
