#!/usr/bin/env bash

set -euo pipefail

REPO="rifuki/dokuru"
BINARY_NAME="dokuru"
INSTALL_DIR="${DOKURU_INSTALL_DIR:-/usr/local/bin}"
INSTALL_PATH="${INSTALL_DIR}/${BINARY_NAME}"
CONFIG_DIR="${DOKURU_CONFIG_DIR:-/etc/dokuru}"
SYSTEMD_DIR="${DOKURU_SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_NAME="${DOKURU_SERVICE_NAME:-dokuru}"
RELEASE_BASE_URL="https://github.com/${REPO}/releases/download/latest"

TMP_DIR=""
ARCH_LABEL=""
BINARY_ASSET=""
CHECKSUM_TOOL=""
YES="0"
RUN_BIN=""
REUSE_INSTALLED="0"
SUDO_CMD=()
RED=''
GREEN=''
ORANGE=''
CYAN=''
MUTED=''
BOLD=''
RESET=''

cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

note() {
  printf '%b·%b %b%s%b\n' "${MUTED}" "${RESET}" "${MUTED}" "$*" "${RESET}"
}

ok() {
  printf '%b✓%b %s\n' "${GREEN}" "${RESET}" "$*"
}

die() {
  printf '%b✗%b %s\n' "${RED}" "${RESET}" "$*" >&2
  exit 1
}

section() {
  printf '\n%b[%s]%b %b%s%b\n' "${ORANGE}" "$1" "${RESET}" "${ORANGE}" "$2" "${RESET}"
}

setup_ui() {
  if [ -t 1 ]; then
    RED='\033[38;5;203m'
    GREEN='\033[38;5;121m'
    ORANGE='\033[38;5;215m'
    CYAN='\033[38;5;45m'
    MUTED='\033[38;5;245m'
    BOLD='\033[1m'
    RESET='\033[0m'
  fi
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Required command '$1' not found"
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -y|--yes)
        YES="1"
        ;;
      -h|--help)
        cat <<EOF
Dokuru bootstrap installer

Usage:
  install.sh [options]

Options:
  -y, --yes     Skip interactive prompts inside dokuru onboard
  -h, --help    Show this help message
EOF
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
    shift
  done
}

print_banner() {
  printf '\n'
  printf '  %b🐳 Dokuru Installer%b\n' "${ORANGE}${BOLD}" "${RESET}"
  printf '  %bHardening your Docker host without the yak shave.%b\n' "${MUTED}" "${RESET}"
}

detect_platform() {
  case "$(uname -s)" in
    Linux) ;;
    *) die "Dokuru installer currently supports Linux only" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)
      ARCH_LABEL="amd64"
      ;;
    aarch64|arm64)
      ARCH_LABEL="arm64"
      ;;
    *)
      die "Unsupported architecture: $(uname -m)"
      ;;
  esac

  BINARY_ASSET="${BINARY_NAME}-linux-${ARCH_LABEL}"
}

detect_checksum_tool() {
  if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM_TOOL="sha256sum"
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    CHECKSUM_TOOL="shasum"
    return
  fi

  die "Neither sha256sum nor shasum is available"
}

print_plan() {
  printf '\n%bInstall plan%b\n' "${ORANGE}${BOLD}" "${RESET}"
  printf '%bOS:%b linux\n' "${MUTED}" "${RESET}"
  printf '%bArchitecture:%b %s\n' "${MUTED}" "${RESET}" "${ARCH_LABEL}"
  printf '%bInstall method:%b binary release\n' "${MUTED}" "${RESET}"
  printf '%bRequested channel:%b latest\n' "${MUTED}" "${RESET}"
  printf '%bBinary path:%b %s\n' "${MUTED}" "${RESET}" "${INSTALL_PATH}"
}

ensure_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    return
  fi

  need_cmd sudo
  if [ "${#SUDO_CMD[@]}" -eq 0 ]; then
    if sudo -n true >/dev/null 2>&1; then
      SUDO_CMD=(sudo -n)
      note "Using passwordless sudo"
      return
    fi

    note "Requesting elevated permissions"
    sudo -v
    SUDO_CMD=(sudo)
  fi
}

run_root() {
  if [ "${#SUDO_CMD[@]}" -gt 0 ]; then
    "${SUDO_CMD[@]}" "$@"
  else
    "$@"
  fi
}

installed_binary_supports_onboard() {
  [ -x "${INSTALL_PATH}" ] && "${INSTALL_PATH}" onboard --help >/dev/null 2>&1
}

prepare_environment() {
  section "1/3" "Preparing environment"
  need_cmd curl
  detect_checksum_tool

  ok "Detected: linux/${ARCH_LABEL}"
  ok "Checksum tool: ${CHECKSUM_TOOL}"

  if installed_binary_supports_onboard; then
    REUSE_INSTALLED="1"
    RUN_BIN="${INSTALL_PATH}"
    ok "Existing Dokuru installation found at ${INSTALL_PATH}"
    note "Skipping binary download and reusing the installed Dokuru CLI"
  else
    note "No reusable Dokuru installation found; latest release will be installed"
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  local label="${3:-}"
  local pid frames i spin exit_code

  if [ -t 1 ] && [ -n "${label}" ]; then
    frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    curl --fail --location --retry 3 --retry-delay 1 --silent -o "${output}" "${url}" &
    pid=$!
    i=0
    while kill -0 "${pid}" 2>/dev/null; do
      spin="${frames[$((i % 10))]}"
      printf '\r%b%s%b %s' "${CYAN}" "${spin}" "${RESET}" "${label}"
      i=$((i + 1))
      sleep 0.08
    done
    wait "${pid}"
    exit_code=$?
    if [ "${exit_code}" -ne 0 ]; then
      printf '\r%b✗%b %s\n' "${RED}" "${RESET}" "${label}" >&2
      return "${exit_code}"
    fi
    printf '\r%b✓%b %s\n' "${GREEN}" "${RESET}" "${label}"
  else
    curl --fail --location --retry 3 --retry-delay 1 --silent -o "${output}" "${url}"
  fi
}

download_release_assets() {
  TMP_DIR="$(mktemp -d)"
  download_file "${RELEASE_BASE_URL}/${BINARY_ASSET}" "${TMP_DIR}/${BINARY_ASSET}" "${ARCH_LABEL} binary"
  chmod +x "${TMP_DIR}/${BINARY_ASSET}"
  download_file "${RELEASE_BASE_URL}/SHA256SUMS" "${TMP_DIR}/SHA256SUMS" "checksums"
}

verify_checksum() {
  (
    cd "${TMP_DIR}"
    
    # Extract expected checksum
    EXPECTED_SUM=$(grep "  ${BINARY_ASSET}\$" SHA256SUMS | awk '{print $1}')
    
    # Verify checksum (suppress output)
    if [ "${CHECKSUM_TOOL}" = "sha256sum" ]; then
      RESULT=$(grep "  ${BINARY_ASSET}\$" SHA256SUMS | sha256sum -c - 2>&1)
    else
      RESULT=$(grep "  ${BINARY_ASSET}\$" SHA256SUMS | shasum -a 256 -c - 2>&1)
    fi
    
    # Check if verification passed
    if echo "${RESULT}" | grep -q "OK"; then
      # Truncate hash for display (first 8 + last 8 chars)
      SHORT_SUM="${EXPECTED_SUM:0:8}...${EXPECTED_SUM: -8}"
      ok "Integrity verified · ${SHORT_SUM}"
      return 0
    else
      die "Checksum verification failed for ${BINARY_ASSET}"
    fi
  )
}

install_binary() {
  ensure_sudo
  run_root mkdir -p "${INSTALL_DIR}"
  run_root install -m 0755 "${TMP_DIR}/${BINARY_ASSET}" "${INSTALL_PATH}"
  RUN_BIN="${INSTALL_PATH}"
}

prepare_binary() {
  section "2/3" "Installing Dokuru"

  if [ "${REUSE_INSTALLED}" = "1" ]; then
    ok "Dokuru already installed"
    note "Using ${INSTALL_PATH}"
    return
  fi

  download_release_assets
  verify_checksum
  install_binary
  ok "Dokuru installed to ${INSTALL_PATH}"
}

onboard_args() {
  local -a args

  args=(
    onboard
    --install-path "${INSTALL_PATH}"
    --config-dir "${CONFIG_DIR}"
    --systemd-dir "${SYSTEMD_DIR}"
    --service-name "${SERVICE_NAME}"
  )

  if [ "${YES}" = "1" ]; then
    args+=(--yes)
  fi

  if [ -n "${DOKURU_PORT:-}" ]; then
    args+=(--port "${DOKURU_PORT}")
  fi

  if [ -n "${DOKURU_HOST:-}" ]; then
    args+=(--host "${DOKURU_HOST}")
  fi

  if [ -n "${DOKURU_DOCKER_SOCKET:-}" ]; then
    args+=(--docker-socket "${DOKURU_DOCKER_SOCKET}")
  fi

  if [ -n "${DOKURU_CORS_ORIGINS:-}" ]; then
    args+=(--cors-origins "${DOKURU_CORS_ORIGINS}")
  fi

  if [ -n "${DOKURU_SKIP_SERVICE:-}" ]; then
    args+=(--skip-service)
  fi

  if [ -n "${DOKURU_INSTALL_DOCKER:-}" ]; then
    args+=(--install-docker)
  fi

  printf '%s\n' "${args[@]}"
}

run_onboard() {
  local -a cmd

  section "3/3" "Launching onboarding"
  ensure_sudo

  cmd=("${RUN_BIN}")
  while IFS= read -r arg; do
    cmd+=("${arg}")
  done < <(onboard_args)

  note "Starting Dokuru onboarding wizard"
  if [ "${#SUDO_CMD[@]}" -gt 0 ]; then
    "${SUDO_CMD[@]}" "${cmd[@]}"
  else
    "${cmd[@]}"
  fi
}

main() {
  parse_args "$@"
  setup_ui
  print_banner
  detect_platform
  print_plan
  prepare_environment
  prepare_binary
  run_onboard
}

main "$@"
