#!/usr/bin/env bash
# Launch the deployed fishtank (https://fish.kns.li) tuned to the machine it
# runs on. Standalone: copy just this file to the Pi — no repo, builds, or
# local server needed. Always the full 1080p scene; only runtime settings vary.
#
# What it probes, and what each probe decides:
#   - Pi model               -> fps cap (32 on a Pi, 62 elsewhere)
#   - v3d/vc4 kernel driver  -> warn if the Pi would software-render
#   - vcgencmd get_throttled -> warn about power/cooling before blaming the code
#   - connected display mode -> warn when scanout is above 1080p (bandwidth)
#   - available runtimes     -> cog (WPE/KMS) > chromium kiosk > default browser
#
# Usage: launch-web.sh [--res 1|2|3] [--cap N] [--browser auto|cog|chromium|default]
#                      [--url URL] [--debug] [--dry-run]
#   --res      buffer resolution via ?res= (default 3 = 1920x1080)
#   --cap      force the fps cap (needs a deploy that understands ?cap)
#   --debug    append ?debug&uncap: live perf panel (fps, frame ms, draws, heap, GL)
#   --dry-run  print every probe and the final command without launching
set -euo pipefail

URL_BASE="https://fish.kns.li/"
RES=3 CAP="" BROWSER="auto" DEBUG=0 DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --res) RES="$2"; shift 2 ;;
    --cap) CAP="$2"; shift 2 ;;
    --browser) BROWSER="$2"; shift 2 ;;
    --url) URL_BASE="$2"; shift 2 ;;
    --debug) DEBUG=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown option: $1 (see header of $0)"; exit 2 ;;
  esac
done

note() { printf '  %-12s %s\n' "$1:" "$2"; }
warn() { printf '  %-12s %s\n' "WARNING" "$1"; }

# --- hardware probes ---------------------------------------------------------

OS="$(uname -s)"
MODEL="generic $OS"
IS_PI=0
if [ -r /proc/device-tree/model ]; then
  MODEL="$(tr -d '\0' </proc/device-tree/model)"
  case "$MODEL" in *"Raspberry Pi"*) IS_PI=1 ;; esac
fi
note machine "$MODEL"

if [ "$IS_PI" = 1 ]; then
  # Real GPU present? Without the KMS driver everything falls back to llvmpipe
  # and no launch tuning can save it.
  if ! grep -qs v3d /proc/modules && ! ls /sys/bus/platform/drivers/v3d 2>/dev/null >/dev/null; then
    warn "v3d kernel driver not loaded - enable 'dtoverlay=vc4-kms-v3d' in /boot/firmware/config.txt"
  fi
  # Undervoltage or thermal throttling caps the GPU clock long before the scene
  # is the bottleneck.
  if command -v vcgencmd >/dev/null; then
    THROTTLED="$(vcgencmd get_throttled | cut -d= -f2)"
    [ "$THROTTLED" != "0x0" ] && warn "vcgencmd reports throttling ($THROTTLED) - check PSU/cooling"
  fi
  # The scene stays 1080p, so scanout above 1080p doubly hurts: the GPU pays
  # for the big framebuffer AND the upscale composite.
  for m in /sys/class/drm/card*-*/modes; do
    [ -r "$m" ] || continue
    MODE="$(head -n1 "$m" 2>/dev/null || true)"
    [ -z "$MODE" ] && continue
    H="${MODE#*x}"
    if [ "${H%%[^0-9]*}" -gt 1080 ] 2>/dev/null; then
      warn "display scanning out at $MODE - drop the output to 1920x1080 for real fps gains"
    fi
  done
fi

[ -z "$CAP" ] && { [ "$IS_PI" = 1 ] && CAP=32 || CAP=62; }
note "fps cap" "$CAP"

QUERY="?cap=$CAP"
[ "$DEBUG" = 1 ] && QUERY="?debug&uncap"
[ "$RES" != 3 ] && QUERY="$QUERY&res=$RES"
URL="${URL_BASE%/}/$QUERY"

# --- pick the runtime --------------------------------------------------------

LAUNCH=()
if [ "$BROWSER" = auto ]; then
  if [ "$OS" = Darwin ]; then BROWSER=default
  elif command -v cog >/dev/null; then BROWSER=cog
  elif command -v chromium-browser >/dev/null || command -v chromium >/dev/null; then BROWSER=chromium
  else BROWSER=default
  fi
fi
case "$BROWSER" in
  cog)
    # WPE WebKit: fullscreen web rendering with no desktop compositor in the
    # path. On a bare console it can take the DRM/KMS display directly.
    if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ]; then
      export COG_PLATFORM_NAME=drm
      note runtime "cog (WPE, direct DRM/KMS - no compositor)"
    else
      note runtime "cog (WPE)"
    fi
    LAUNCH=(cog "$URL")
    ;;
  chromium)
    CHROMIUM="$(command -v chromium-browser || command -v chromium || true)"
    if [ -z "$CHROMIUM" ]; then echo "chromium not found on PATH"; exit 1; fi
    FLAGS=(--kiosk --noerrdialogs --disable-session-crashed-bubble
           --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist
           --user-data-dir=/tmp/fishtank-chromium)
    [ -n "${WAYLAND_DISPLAY:-}" ] && FLAGS+=(--ozone-platform=wayland)
    note runtime "chromium kiosk (exit: Alt+F4)"
    LAUNCH=("$CHROMIUM" "${FLAGS[@]}" "$URL")
    ;;
  default)
    if [ "$OS" = Darwin ]; then LAUNCH=(open "$URL"); else LAUNCH=(xdg-open "$URL"); fi
    note runtime "default browser"
    ;;
  *) echo "invalid --browser $BROWSER"; exit 2 ;;
esac

note url "$URL"

if [ "$DRY" = 1 ]; then
  note command "(dry run) ${LAUNCH[*]}"
  exit 0
fi

exec "${LAUNCH[@]}"
