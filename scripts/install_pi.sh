#!/usr/bin/env bash
set -euo pipefail

# EcoEYE Raspberry Pi one-command installer
# Usage:
#   ./scripts/install_pi.sh --repo-url <git-url> [--branch main] [--app-dir ~/EcoEYE]

REPO_URL=""
BRANCH="main"
APP_DIR="$HOME/EcoEYE"
SKIP_DOCKER_INSTALL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --skip-docker-install)
      SKIP_DOCKER_INSTALL="true"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --repo-url <git-url> [--branch main] [--app-dir ~/EcoEYE] [--skip-docker-install]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_URL" ]]; then
  echo "Error: --repo-url is required"
  exit 1
fi

log() {
  printf "\n[EcoEYE Installer] %s\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

install_docker_if_needed() {
  if [[ "$SKIP_DOCKER_INSTALL" == "true" ]]; then
    log "Skipping Docker installation by request"
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed"
    return
  fi

  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh

  if ! groups "$USER" | grep -q '\bdocker\b'; then
    log "Adding $USER to docker group"
    sudo usermod -aG docker "$USER"
    echo "You may need to logout/login once for docker group changes to apply."
  fi

  sudo systemctl enable docker
  sudo systemctl start docker
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    log "Docker Compose plugin available"
    return
  fi

  log "Docker Compose plugin not found. Installing plugin package"
  sudo apt-get update
  sudo apt-get install -y docker-compose-plugin
}

clone_or_update_repo() {
  if [[ -d "$APP_DIR/.git" ]]; then
    log "Repository exists, updating $APP_DIR"
    git -C "$APP_DIR" fetch origin
    git -C "$APP_DIR" checkout "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    log "Cloning repository into $APP_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
}

prepare_env() {
  if [[ ! -f "$APP_DIR/.env" ]]; then
    if [[ -f "$APP_DIR/.env.example" ]]; then
      log "Creating .env from .env.example"
      cp "$APP_DIR/.env.example" "$APP_DIR/.env"
      echo "Please edit $APP_DIR/.env before production use."
    else
      log ".env.example not found, creating minimal .env"
      cat > "$APP_DIR/.env" <<'ENVEOF'
APP_USERNAME=admin
APP_PASSWORD=changeme
APP_SECRET=replace-with-a-strong-random-secret
TOKEN_TTL_SECONDS=28800
ENVEOF
    fi
  else
    log ".env already present"
  fi
}

build_and_run() {
  log "Building Docker image"
  docker compose -f "$APP_DIR/docker-compose.yml" --env-file "$APP_DIR/.env" build

  log "Starting EcoEYE container"
  docker compose -f "$APP_DIR/docker-compose.yml" --env-file "$APP_DIR/.env" up -d
}

health_check() {
  log "Waiting for service health"
  for i in {1..30}; do
    if curl -fsS "http://localhost:9000/health" >/dev/null 2>&1; then
      log "EcoEYE is healthy at http://localhost:9000"
      return
    fi
    sleep 2
  done

  echo "Health check failed. Check logs:"
  echo "docker compose -f $APP_DIR/docker-compose.yml --env-file $APP_DIR/.env logs -f ecoeye-app"
  exit 1
}

main() {
  require_cmd curl
  require_cmd git
  install_docker_if_needed
  ensure_compose
  clone_or_update_repo
  prepare_env
  build_and_run
  health_check

  cat <<EOF

Done.

Next:
1. Open: http://<PI_IP>:9000
2. Login with credentials in: $APP_DIR/.env
3. Complete Initial Setup wizard

Useful commands:
- docker compose -f $APP_DIR/docker-compose.yml --env-file $APP_DIR/.env ps
- docker compose -f $APP_DIR/docker-compose.yml --env-file $APP_DIR/.env logs -f ecoeye-app
- docker compose -f $APP_DIR/docker-compose.yml --env-file $APP_DIR/.env down

EOF
}

main
