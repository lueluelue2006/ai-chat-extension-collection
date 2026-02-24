#!/usr/bin/env bash
set -uo pipefail

# Supervisor for dev/memguard.sh.
# Why: background jobs can die unexpectedly (shell/harness/user actions). This wrapper auto-restarts
# memguard so the "extreme memory" protection stays alive during long unattended matrix runs.
#
# Usage (recommended):
#   nohup env EXTENSION_ID=... MODE=close RENDERER_RSS_MB_ABORT=5000 FREE_PCT_ABORT=2 INTERVAL_SEC=5 \\
#     CONSECUTIVE_HITS=3 COOLDOWN_SEC=180 MAX_RUNTIME_SEC=43200 LOG_PATH=~/Downloads/quicknav-memguard.log \\
#     bash dev/memguard-supervisor.sh >/dev/null 2>&1 & disown
#
# Stop:
#   pkill -f "dev/memguard-supervisor.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMGUARD="${SCRIPT_DIR}/memguard.sh"

SUP_LOG_PATH="${SUP_LOG_PATH:-$HOME/Downloads/quicknav-memguard-supervisor.log}"
RESTART_DELAY_SEC="${RESTART_DELAY_SEC:-2}"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

sup_log() {
  printf '[%s] %s\n' "$(ts)" "$*" >>"$SUP_LOG_PATH"
}

main() {
  if [[ ! -f "$MEMGUARD" ]]; then
    sup_log "FATAL memguard not found: $MEMGUARD"
    exit 1
  fi

  sup_log "START supervisor memguard=$MEMGUARD restart_delay_sec=$RESTART_DELAY_SEC"

  local n=0
  while true; do
    n=$((n + 1))
    sup_log "RUN #$n env MODE=${MODE:-} EXTENSION_ID=${EXTENSION_ID:-} RSS_ABORT_MB=${RENDERER_RSS_MB_ABORT:-} FREE_PCT_ABORT=${FREE_PCT_ABORT:-} INTERVAL_SEC=${INTERVAL_SEC:-}"
    bash "$MEMGUARD"
    local code=$?
    sup_log "EXIT #$n code=$code (restarting in ${RESTART_DELAY_SEC}s)"
    sleep "$RESTART_DELAY_SEC"
  done
}

main "$@"

