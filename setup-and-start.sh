#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# One-time setup: install Docker (Ubuntu/Debian) then start the app.
# Run: ./setup-and-start.sh
# You will be prompted for your sudo password to install Docker.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

install_docker_ubuntu() {
  echo ""
  echo "Installing Docker (requires sudo password once)…"
  echo ""

  # Prerequisites
  sudo apt-get update -qq
  sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

  # Docker official GPG key and repo (Ubuntu)
  . /etc/os-release
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Start Docker and enable on boot
  sudo systemctl start docker
  sudo systemctl enable docker

  # Allow current user to run docker without sudo (optional; may require re-login)
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  echo ""
  echo "Docker installed. If you see 'permission denied' when running ./start.sh, log out and back in, or run: newgrp docker"
  echo ""
}

if ! command -v docker &>/dev/null; then
  if [[ -f /etc/os-release ]]; then
    install_docker_ubuntu
  else
    echo "Docker not found. Please install Docker from https://docs.docker.com/engine/install/ and then run ./start.sh"
    exit 1
  fi
fi

# Use sudo for docker if the user isn't in the docker group yet
WRAP_DIR=""
if ! docker info &>/dev/null 2>&1; then
  echo "Starting Docker daemon (if needed)…"
  sudo systemctl start docker 2>/dev/null || true
  if ! docker info &>/dev/null 2>&1; then
    echo "Using sudo for Docker this session. Add yourself to the 'docker' group and re-login to avoid sudo next time."
    WRAP_DIR="$SCRIPT_DIR/.docker-wrap"
    mkdir -p "$WRAP_DIR"
    REAL_DOCKER="$(command -v docker 2>/dev/null || echo "/usr/bin/docker")"
    cat > "$WRAP_DIR/docker" << WRAPEOF
#!/bin/sh
exec sudo "$REAL_DOCKER" "\$@"
WRAPEOF
    chmod +x "$WRAP_DIR/docker"
    export PATH="$WRAP_DIR:$PATH"
  fi
fi

# Run the normal start script
exec ./start.sh
