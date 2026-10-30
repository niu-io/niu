#!/usr/bin/env bash
# Niu Self-Hosted Installer & Upgrade Manager
# Supports: install, upgrade, rollback, status
set -euo pipefail

DEFAULT_VERSION="v0.2.30"
DEFAULT_DIR="${NIU_INSTALL_DIR:-/opt/niu}"
DEFAULT_PORT="${NIU_HOST_PORT:-2555}"
IMAGE_REPO="ghcr.io/niu-io/niu"
GITHUB_REPO_RAW="https://raw.githubusercontent.com/niu-io/niu"

usage() {
  cat <<EOF
Usage:
  install.sh <command> [options]

Commands:
  install     Initialize configuration, secrets, and start Niu
  upgrade     Back up PostgreSQL, verify encryption, and upgrade Niu to a target version (with auto-rollback)
  rollback    Restore the previous Niu image version from .env (restores the pre-upgrade dump if the image cannot start)
  status      Show installed version, container state, and gateway readiness

Options:
  --version <vX.Y.Z>   Target Niu release tag (default: ${DEFAULT_VERSION})
  --dir <path>         Installation directory (default: /opt/niu, or current directory if compose.yaml exists)
  --port <port>        Host port to bind (default: 2555)
  --keep-data          rollback only: do not restore NIU_PREVIOUS_BACKUP
  --help               Show this help message
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not installed." >&2
    exit 1
  fi
}

random_secret() {
  local bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$bytes" | tr -d '\n/+=' | cut -c1-"$bytes"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_urlsafe($bytes)[:$bytes])"
  else
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$bytes"
  fi
}

normalize_tag() {
  local raw="$1"
  if [[ "$raw" != v* ]]; then
    raw="v${raw}"
  fi
  if [[ ! "$raw" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "error: version must be a semantic version tag like v0.2.0 (got '$1')" >&2
    exit 1
  fi
  printf '%s' "$raw"
}

resolve_install_dir() {
  local requested="$1"
  if [[ -n "$requested" ]]; then
    printf '%s' "$requested"
  elif [[ -f "./compose.yaml" && -f "./VERSION" ]]; then
    pwd
  else
    printf '%s' "$DEFAULT_DIR"
  fi
}

set_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  if [[ -f "$file" ]] && grep -q "^${key}=" "$file"; then
    local tmp="${file}.tmp.$$"
    (
      umask 077
      KEY="$key" VAL="$value" awk 'BEGIN{FS=OFS="="} $1==ENVIRON["KEY"] {$0=ENVIRON["KEY"]"="ENVIRON["VAL"]} {print}' "$file" >"$tmp"
    )
    chmod 600 "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
    chmod 600 "$file"
  fi
}

get_env_var() {
  local file="$1"
  local key="$2"
  if [[ -f "$file" ]]; then
    grep "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true
  fi
}

wait_for_ready() {
  local port="$1"
  local timeout_secs="${2:-60}"
  local url="http://127.0.0.1:${port}/readyz"
  local elapsed=0
  echo "Waiting for Niu gateway readiness at ${url} ..."
  while (( elapsed < timeout_secs )); do
    if curl --fail --silent --max-time 2 "$url" >/dev/null 2>&1; then
      echo "Niu gateway is healthy and ready."
      return 0
    fi
    sleep 2
    elapsed=$(( elapsed + 2 ))
  done
  return 1
}

ensure_files() {
  local dir="$1"
  local tag="$2"
  mkdir -p "${dir}/config" "${dir}/backups"

  if [[ ! -f "${dir}/compose.yaml" ]]; then
    curl --fail --silent --show-error --location \
      "${GITHUB_REPO_RAW}/${tag}/compose.yaml" -o "${dir}/compose.yaml"
  fi

  if [[ ! -f "${dir}/config/niu.example.toml" ]]; then
    curl --fail --silent --show-error --location \
      "${GITHUB_REPO_RAW}/${tag}/config/niu.example.toml" -o "${dir}/config/niu.example.toml"
  fi
}

prepare_image() {
  local dir="$1"
  local tag="$2"
  local target_image="$3"

  if docker image inspect "$target_image" >/dev/null 2>&1; then
    return 0
  fi
  if docker pull "$target_image" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -f "${dir}/Dockerfile" ]]; then
    echo "Building ${target_image} from local source in ${dir} ..."
    docker build -t "$target_image" "$dir"
    return 0
  fi
  echo "Building ${target_image} from release archive ${tag} ..."
  docker build -t "$target_image" "https://github.com/niu-io/niu.git#${tag}"
}

cmd_install() {
  local dir="$1"
  local tag="$2"
  local port="$3"

  require_cmd docker
  require_cmd curl
  docker compose version >/dev/null 2>&1 || {
    echo "error: 'docker compose' plugin is required." >&2
    exit 1
  }

  ensure_files "$dir" "$tag"
  local env_file="${dir}/.env"
  touch "$env_file"
  chmod 600 "$env_file"

  if [[ -z "$(get_env_var "$env_file" POSTGRES_PASSWORD)" ]]; then
    set_env_var "$env_file" POSTGRES_PASSWORD "$(random_secret 32)"
  fi
  if [[ -z "$(get_env_var "$env_file" NIU_ADMIN_TOKENS)" ]]; then
    set_env_var "$env_file" NIU_ADMIN_TOKENS "niu_admin_$(random_secret 40)"
  fi
  if [[ -z "$(get_env_var "$env_file" NIU_VENDOR_ENCRYPTION_KEY)" ]]; then
    set_env_var "$env_file" NIU_VENDOR_ENCRYPTION_KEY "$(random_secret 48)"
  fi
  if [[ -z "$(get_env_var "$env_file" OPENROUTER_API_KEY)" ]]; then
    set_env_var "$env_file" OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-sk-or-v1-replace-me}"
  fi

  local target_image="${IMAGE_REPO}:${tag}"
  set_env_var "$env_file" NIU_HOST_PORT "$port"
  set_env_var "$env_file" NIU_VERSION "$tag"
  set_env_var "$env_file" NIU_IMAGE "$target_image"

  echo "Installing Niu ${tag} in ${dir} ..."
  prepare_image "$dir" "$tag" "$target_image"
  (
    cd "$dir"
    docker compose --env-file "$env_file" up -d
  )

  if ! wait_for_ready "$port" 60; then
    echo "error: Niu did not become ready within 60s. Check logs with: docker compose -f ${dir}/compose.yaml logs niu" >&2
    exit 1
  fi

  echo ""
  echo "Niu ${tag} is running at http://127.0.0.1:${port}"
  echo "  Dashboard:      http://127.0.0.1:${port}/workspaces/default/"
  echo "  Setup Console:  http://127.0.0.1:${port}/installation"
  echo "  Model Catalog:  http://127.0.0.1:${port}/models/"
  echo "  Documentation:  http://127.0.0.1:${port}/docs/"
}

wait_for_postgres() {
  local dir="$1"
  local env_file="$2"
  local elapsed=0
  while (( elapsed < 30 )); do
    if (cd "$dir" && docker compose --env-file "$env_file" exec -T postgres pg_isready -U niu -d niu >/dev/null 2>&1); then
      return 0
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
  done
  return 1
}

# Restore the dump taken immediately before an upgrade. This is intentionally
# destructive: it is the only consistent database state a pre-upgrade binary
# can open after the schema baseline has changed. The service stays stopped
# until the restored database is ready.
restore_database() {
  local dir="$1"
  local env_file="$2"
  local backup="$3"
  if [[ ! -s "$backup" ]]; then
    echo "error: pre-upgrade database backup is missing or empty: ${backup}" >&2
    return 1
  fi
  echo "Restoring PostgreSQL from ${backup}." >&2
  echo "WARNING: records written after this backup will be lost." >&2
  (cd "$dir" && docker compose --env-file "$env_file" stop niu >/dev/null 2>&1 || true)
  (cd "$dir" && docker compose --env-file "$env_file" up -d postgres)
  if ! wait_for_postgres "$dir" "$env_file"; then
    echo "error: PostgreSQL did not become ready for restore." >&2
    return 1
  fi
  if ! (cd "$dir" && docker compose --env-file "$env_file" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U niu -d niu \
      -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' >/dev/null); then
    echo "error: could not reset the public schema before restore." >&2
    return 1
  fi
  if ! (cd "$dir" && gzip -dc "$backup" | docker compose --env-file "$env_file" exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U niu -d niu >/dev/null); then
    echo "error: PostgreSQL restore failed." >&2
    return 1
  fi
  echo "PostgreSQL restore completed." >&2
}

cmd_upgrade() {
  local dir="$1"
  local target_tag="$2"

  require_cmd docker
  require_cmd curl
  local env_file="${dir}/.env"
  if [[ ! -f "$env_file" || ! -f "${dir}/compose.yaml" ]]; then
    echo "error: no existing Niu installation found in ${dir} (missing .env or compose.yaml)." >&2
    exit 1
  fi

  local current_image
  current_image="$(get_env_var "$env_file" NIU_IMAGE)"
  local current_version
  current_version="$(get_env_var "$env_file" NIU_VERSION)"
  local port
  port="$(get_env_var "$env_file" NIU_HOST_PORT)"
  port="${port:-$DEFAULT_PORT}"
  local target_image="${IMAGE_REPO}:${target_tag}"

  echo "Upgrading Niu in ${dir}: ${current_version:-unknown} -> ${target_tag}"
  mkdir -p "${dir}/backups"
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local backup_file="${dir}/backups/niu-pre-upgrade-${timestamp}.sql.gz"

  echo "1/4 Backing up PostgreSQL database to ${backup_file} ..."
  (
    cd "$dir"
    docker compose --env-file "$env_file" exec -T postgres pg_dump -U niu -d niu | gzip >"$backup_file"
  )
  if [[ ! -s "$backup_file" ]]; then
    echo "error: PostgreSQL backup is empty; refusing to upgrade." >&2
    exit 1
  fi
  set_env_var "$env_file" NIU_PREVIOUS_BACKUP "$backup_file"

  echo "2/4 Preparing target image ${target_image} ..."
  prepare_image "$dir" "$target_tag" "$target_image"

  echo "3/4 Running pre-upgrade encryption verification ..."
  (
    cd "$dir"
    NIU_IMAGE="$target_image" docker compose --env-file "$env_file" run --rm --no-deps niu --check-encryption
  )

  if [[ -n "$current_image" ]]; then
    set_env_var "$env_file" NIU_PREVIOUS_IMAGE "$current_image"
  fi
  set_env_var "$env_file" NIU_VERSION "$target_tag"
  set_env_var "$env_file" NIU_IMAGE "$target_image"

  echo "4/4 Applying container update and verifying readiness ..."
  (
    cd "$dir"
    docker compose --env-file "$env_file" up -d niu
  )

  if wait_for_ready "$port" 60; then
    echo "Upgrade to Niu ${target_tag} completed successfully."
    return 0
  fi

  echo "error: Niu ${target_tag} failed readiness checks. Rolling back to ${current_image:-previous image} ..." >&2
  if [[ -n "$current_image" ]]; then
    set_env_var "$env_file" NIU_IMAGE "$current_image"
    [[ -n "$current_version" ]] && set_env_var "$env_file" NIU_VERSION "$current_version"
    (
      cd "$dir"
      docker compose --env-file "$env_file" up -d niu
    )
    if wait_for_ready "$port" 60; then
      echo "Image rollback completed; the database was left unchanged." >&2
    elif restore_database "$dir" "$env_file" "$backup_file"; then
      (cd "$dir" && docker compose --env-file "$env_file" up -d niu)
      if ! wait_for_ready "$port" 60; then
        echo "error: rollback container (${current_image}) failed readiness after database restore." >&2
      fi
    fi
  fi
  exit 1
}

cmd_rollback() {
  local dir="$1"
  local keep_data="${2:-0}"
  local env_file="${dir}/.env"
  if [[ ! -f "$env_file" ]]; then
    echo "error: no .env found in ${dir}" >&2
    exit 1
  fi
  local prev_image
  prev_image="$(get_env_var "$env_file" NIU_PREVIOUS_IMAGE)"
  if [[ -z "$prev_image" ]]; then
    echo "error: NIU_PREVIOUS_IMAGE is not recorded in ${env_file}" >&2
    exit 1
  fi
  local port
  port="$(get_env_var "$env_file" NIU_HOST_PORT)"
  port="${port:-$DEFAULT_PORT}"

  echo "Rolling back Niu to ${prev_image} ..."
  set_env_var "$env_file" NIU_IMAGE "$prev_image"
  set_env_var "$env_file" NIU_VERSION "${prev_image##*:}"
  (
    cd "$dir"
    docker compose --env-file "$env_file" up -d niu
  )
  if wait_for_ready "$port" 60; then
    echo "Rollback to ${prev_image} completed; the database was left unchanged."
    return 0
  fi
  if [[ "$keep_data" == "1" ]]; then
    echo "error: previous image cannot start against the current schema; rerun without --keep-data to restore the pre-upgrade backup." >&2
    exit 1
  fi
  local backup
  backup="$(get_env_var "$env_file" NIU_PREVIOUS_BACKUP)"
  if [[ -z "$backup" ]]; then
    echo "error: previous image cannot start and NIU_PREVIOUS_BACKUP is not recorded; restore a pre-upgrade dump manually." >&2
    exit 1
  fi
  if ! restore_database "$dir" "$env_file" "$backup"; then
    echo "error: database restore failed; the installation remains stopped." >&2
    exit 1
  fi
  (cd "$dir" && docker compose --env-file "$env_file" up -d niu)
  if ! wait_for_ready "$port" 60; then
    echo "error: previous image (${prev_image}) failed readiness after database restore." >&2
    exit 1
  fi
  echo "Rollback to ${prev_image} completed with the pre-upgrade database restored."
}

cmd_status() {
  local dir="$1"
  local env_file="${dir}/.env"
  local version="unknown"
  local image="unknown"
  local port="$DEFAULT_PORT"
  if [[ -f "$env_file" ]]; then
    version="$(get_env_var "$env_file" NIU_VERSION)"
    image="$(get_env_var "$env_file" NIU_IMAGE)"
    local p
    p="$(get_env_var "$env_file" NIU_HOST_PORT)"
    [[ -n "$p" ]] && port="$p"
  fi
  echo "Directory: ${dir}"
  echo "Version:   ${version:-unknown}"
  echo "Image:     ${image:-unknown}"
  if [[ -f "${dir}/compose.yaml" ]]; then
    (cd "$dir" && docker compose ps)
  fi
  echo -n "Readiness: "
  curl --silent --max-time 3 "http://127.0.0.1:${port}/readyz" || echo "unreachable"
  echo ""
}

main() {
  if [[ $# -eq 0 ]]; then
    usage
    exit 1
  fi

  local subcommand="$1"
  shift

  local version="$DEFAULT_VERSION"
  local requested_dir=""
  local port="$DEFAULT_PORT"
  local keep_data=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --version)
        version="$(normalize_tag "$2")"
        shift 2
        ;;
      --dir)
        requested_dir="$2"
        shift 2
        ;;
      --port)
        port="$2"
        shift 2
        ;;
      --keep-data)
        keep_data=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "error: unknown option '$1'" >&2
        usage
        exit 1
        ;;
    esac
  done

  version="$(normalize_tag "$version")"
  local dir
  dir="$(resolve_install_dir "$requested_dir")"

  case "$subcommand" in
    install)
      cmd_install "$dir" "$version" "$port"
      ;;
    upgrade)
      cmd_upgrade "$dir" "$version"
      ;;
    rollback)
      cmd_rollback "$dir" "$keep_data"
      ;;
    status)
      cmd_status "$dir"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "error: unknown command '${subcommand}'" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
