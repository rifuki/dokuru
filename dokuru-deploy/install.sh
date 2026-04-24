#!/usr/bin/env bash

set -euo pipefail

REPO="rifuki/dokuru"
BINARY_NAME="dokuru-deploy"
INSTALL_DIR="${HOME}/.local/bin"
INSTALL_PATH="${INSTALL_DIR}/${BINARY_NAME}"
RELEASE_BASE_URL="https://github.com/${REPO}/releases/download/latest-deploy"

TMP_DIR=""
BINARY_ASSET="dokuru-deploy"
RED=''
GREEN=''
ORANGE=''
CYAN=''
MUTED=''
RESET=''

cleanup() {
  if [ -n "${TMP_DIR}" ] && [ -d "${TMP_DIR}" ]; then
    rm -rf "${TMP_DIR}"
  fi
}

trap cleanup EXIT

ok() {
  printf '%b✓%b %s\n' "${GREEN}" "${RESET}" "$*"
}

die() {
  printf '%b✗%b %s\n' "${RED}" "${RESET}" "$*" >&2
  exit 1
}

note() {
  printf '%b·%b %s\n' "${MUTED}" "${RESET}" "$*"
}

setup_ui() {
  if [ -t 1 ]; then
    RED='\033[38;5;203m'
    GREEN='\033[38;5;121m'
    ORANGE='\033[38;5;215m'
    CYAN='\033[38;5;45m'
    MUTED='\033[38;5;245m'
    RESET='\033[0m'
  fi
}

print_banner() {
  printf '\n'
  printf '  %b🚀 Dokuru Deploy Installer%b\n' "${ORANGE}" "${RESET}"
  printf '  %bDeployment configuration generator for Dokuru%b\n' "${MUTED}" "${RESET}"
  printf '\n'
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Required command '$1' not found"
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

install_binary() {
  TMP_DIR="$(mktemp -d)"
  
  download_file "${RELEASE_BASE_URL}/${BINARY_ASSET}" "${TMP_DIR}/${BINARY_ASSET}" "Downloading binary"
  
  mkdir -p "${INSTALL_DIR}"
  install -m 0755 "${TMP_DIR}/${BINARY_ASSET}" "${INSTALL_PATH}"
  
  ok "Installed to ${INSTALL_PATH}"
}

check_path() {
  if [[ ":${PATH}:" != *":${INSTALL_DIR}:"* ]]; then
    printf '\n%b⚠️  %s is not in your PATH%b\n' "${ORANGE}" "${INSTALL_DIR}" "${RESET}"
    printf '\n%bAdd this to your shell profile (~/.bashrc, ~/.zshrc, etc.):%b\n' "${MUTED}" "${RESET}"
    printf '  %bexport PATH="%s:$PATH"%b\n' "${GREEN}" "${INSTALL_DIR}" "${RESET}"
    printf '\n%bThen reload your shell:%b\n' "${MUTED}" "${RESET}"
    printf '  %bsource ~/.bashrc  # or ~/.zshrc%b\n' "${GREEN}" "${RESET}"
  else
    ok "Ready to use!"
    printf '\n%bRun:%b %b%s init%b\n' "${MUTED}" "${RESET}" "${GREEN}" "${BINARY_NAME}" "${RESET}"
    printf '%bHelp:%b %b%s --help%b\n' "${MUTED}" "${RESET}" "${GREEN}" "${BINARY_NAME}" "${RESET}"
  fi
}

main() {
  setup_ui
  print_banner
  need_cmd curl
  install_binary
  check_path
}

main "$@"
