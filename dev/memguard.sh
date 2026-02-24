#!/usr/bin/env bash
set -uo pipefail

# QuickNav memtest guard for macOS.
#
# User requirement: only intervene when memory is *extremely* high, and prefer closing the memtest tab
# (via the extension) over killing processes.
#
# Strategy:
# - Monitor Chrome renderer RSS (OS-side, via `ps`).
# - When RSS crosses a high threshold for several consecutive checks, trigger an extension-side guard:
#   open `chrome-extension://<id>/dev/memtest.html?memguard=1` in Chrome.
#   The extension background will close the current memtest-created ChatGPT tab (so the matrix can continue).
#
# Notes:
# - This script does NOT require "Allow JavaScript from Apple Events".
# - It only uses AppleScript to open a URL in Chrome.
# - It logs to ~/Downloads/quicknav-memguard.log.

EXTENSION_ID="${EXTENSION_ID:-cjnkfdpkkecpjjblkjnogmgajnglibpf}"
MODE="${MODE:-close}" # close|abort
TRIGGER_URL="chrome-extension://${EXTENSION_ID}/dev/memtest.html?memguard=1"
if [[ "${MODE}" == "abort" ]]; then
  TRIGGER_URL="chrome-extension://${EXTENSION_ID}/dev/memtest.html?memguard_abort=1"
fi

# Defaults tuned for an 8GB machine: this should only trip on serious runaway.
RENDERER_RSS_MB_ABORT="${RENDERER_RSS_MB_ABORT:-5500}" # Trigger when max renderer RSS >= this (MB)
FREE_PCT_ABORT="${FREE_PCT_ABORT:-3}"                 # Optional backstop; user says 15% is common.
CONSECUTIVE_HITS="${CONSECUTIVE_HITS:-3}"             # Require N consecutive hits before abort
COOLDOWN_SEC="${COOLDOWN_SEC:-180}"                   # Minimum time between triggers

RENDERER_RSS_MB_HARD_ABORT="${RENDERER_RSS_MB_HARD_ABORT:-6500}" # Emergency line; trigger immediately (no consecutive)
FREE_PCT_HARD_ABORT="${FREE_PCT_HARD_ABORT:-1}"                 # Emergency line; trigger immediately (no consecutive)

INTERVAL_SEC="${INTERVAL_SEC:-20}"
MAX_RUNTIME_SEC="${MAX_RUNTIME_SEC:-43200}" # 12h

LOG_PATH="${LOG_PATH:-$HOME/Downloads/quicknav-memguard.log}"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  printf '[%s] %s\n' "$(ts)" "$*" >>"$LOG_PATH"
}

get_free_pct() {
  # Example: "System-wide memory free percentage: 30%"
  { memory_pressure -Q 2>/dev/null || true; } \
    | awk -F': ' '/free percentage/ { gsub(/%/,"",$2); gsub(/[^0-9]/,"",$2); print $2; exit }'
}

get_max_renderer_rss_kb() {
  # Output: "<rss_kb>" or empty
  ps ax -o rss,command \
    | { grep -F "Google Chrome Helper (Renderer)" || true; } \
    | awk '{print $1}' \
    | sort -nr \
    | head -n 1
}

trigger_guard() {
  log "TRIGGER mode=${MODE} opening ${TRIGGER_URL}"
  osascript - <<APPLESCRIPT >/dev/null 2>&1 || true
tell application "Google Chrome"
  if (count of windows) is 0 then make new window
  set w to front window
  make new tab at end of tabs of w with properties {URL:"${TRIGGER_URL}"}
end tell
APPLESCRIPT
}

main() {
  trap 'log "EXIT code=$?"; exit 0' EXIT

  log "START memguard EXTENSION_ID=${EXTENSION_ID} MODE=${MODE} RSS_ABORT_MB=${RENDERER_RSS_MB_ABORT} FREE_PCT_ABORT=${FREE_PCT_ABORT} INTERVAL_SEC=${INTERVAL_SEC} CONSECUTIVE_HITS=${CONSECUTIVE_HITS} COOLDOWN_SEC=${COOLDOWN_SEC} MAX_RUNTIME_SEC=${MAX_RUNTIME_SEC}"

  local start lastTrigger hits
  start="$(date +%s)"
  lastTrigger=0
  hits=0

  local rss_abort_kb
  rss_abort_kb="$(( RENDERER_RSS_MB_ABORT * 1024 ))"
  local rss_hard_abort_kb
  rss_hard_abort_kb="$(( RENDERER_RSS_MB_HARD_ABORT * 1024 ))"

  while true; do
    local now
    now="$(date +%s)"
    if (( now - start > MAX_RUNTIME_SEC )); then
      log "EXIT max runtime reached"
      exit 0
    fi

    local free_pct
    free_pct="$(get_free_pct || true)"
    if [[ -z "${free_pct:-}" ]]; then free_pct="999"; fi
    if ! [[ "${free_pct}" =~ ^[0-9]+$ ]]; then free_pct="999"; fi

    local max_rss_kb
    max_rss_kb="$(get_max_renderer_rss_kb || true)"
    if [[ -z "${max_rss_kb:-}" ]]; then max_rss_kb="0"; fi
    if ! [[ "${max_rss_kb}" =~ ^[0-9]+$ ]]; then max_rss_kb="0"; fi

    log "HEARTBEAT free_pct=${free_pct} max_renderer_rss_kb=${max_rss_kb}"

    # Emergency guard: act immediately on extremely dangerous values.
    if (( max_rss_kb >= rss_hard_abort_kb )) || (( free_pct <= FREE_PCT_HARD_ABORT )); then
      if (( now - lastTrigger >= COOLDOWN_SEC )); then
        lastTrigger="$now"
        hits=0
        log "HARD_HIT rss_kb=${max_rss_kb} free_pct=${free_pct}"
        trigger_guard
        sleep "$INTERVAL_SEC"
        continue
      fi
    fi

    local hit=0
    if (( max_rss_kb >= rss_abort_kb )); then hit=1; fi
    if (( free_pct <= FREE_PCT_ABORT )); then hit=1; fi

    if (( hit )); then
      hits="$(( hits + 1 ))"
      log "HIT hits=${hits}/${CONSECUTIVE_HITS}"
    else
      hits=0
    fi

    if (( hits >= CONSECUTIVE_HITS )); then
      if (( now - lastTrigger >= COOLDOWN_SEC )); then
        lastTrigger="$now"
        hits=0
        trigger_guard
      else
        log "SKIP trigger (cooldown)"
      fi
    fi

    sleep "$INTERVAL_SEC"
  done
}

main "$@"
