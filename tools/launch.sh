#!/usr/bin/env bash
# Launch the fishtank with settings auto-tuned to the machine it runs on.
# Raspberry Pi focused, but works on any Linux and on macOS.
#
# What it probes, and what each probe decides:
#   - Pi model + GPU driver  -> RES tier (which dist* build) and the fps cap
#   - v3d/vc4 kernel driver  -> warn if the Pi would software-render
#   - vcgencmd get_throttled -> warn about power/cooling before blaming the code
#   - connected display mode -> warn when scanout is above 1080p (bandwidth)
#   - available runtimes     -> cog (WPE/KMS) > chromium kiosk > default browser
#
# Usage: tools/launch.sh [--res 1|2|3] [--cap N] [--browser auto|cog|chromium|default]
#                        [--port N] [--debug] [--dry-run]
#   --res      force a resolution tier (1=640x360, 2=1280x720, 3=1920x1080)
#   --cap      force the fps cap (default: 32 on a Pi, 62 elsewhere)
#   --debug    append ?gpu&uncap&fps: GL renderer string + big live fps readout
#   --dry-run  print every probe and the final command without launching
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RES="" CAP="" BROWSER="auto" PORT=8931 DEBUG=0 DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --res) RES="$2"; shift 2 ;;
    --cap) CAP="$2"; shift 2 ;;
    --browser) BROWSER="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
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
  # and no scene-side tuning can save it.
  if ! grep -qs v3d /proc/modules && ! ls /sys/bus/platform/drivers/v3d 2>/dev/null >/dev/null; then
    warn "v3d kernel driver not loaded - enable 'dtoverlay=vc4-kms-v3d' in /boot/firmware/config.txt"
  fi
  # Undervoltage or thermal throttling caps the GPU clock long before the scene
  # is the bottleneck.
  if command -v vcgencmd >/dev/null; then
    THROTTLED="$(vcgencmd get_throttled | cut -d= -f2)"
    [ "$THROTTLED" != "0x0" ] && warn "vcgencmd reports throttling ($THROTTLED) - check PSU/cooling"
  fi
  # Scanout above 1080p eats the memory bandwidth the tank needs.
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

# --- pick the tier and cap ---------------------------------------------------

if [ -z "$RES" ]; then
  if [ "$IS_PI" = 1 ]; then
    case "$MODEL" in
      *"Pi 5"*) RES=2 ;;  # V3D 7.1 manages 720p comfortably
      *)        RES=1 ;;  # Pi 4 and older: fill rate is the wall
    esac
  else
    RES=3
  fi
fi
case "$RES" in
  1) DIR="dist-r1" ;;
  2) DIR="dist-r2" ;;
  3) DIR="dist" ;;
  *) echo "invalid --res $RES (want 1, 2, or 3)"; exit 2 ;;
esac
if [ ! -f "$ROOT/$DIR/index.html" ]; then
  echo "build missing: $ROOT/$DIR - build it first (bun run build for dist;"
  echo "for dist-r1/r2 set RES in src/res.ts and 'bun build index.html --outdir <dir> --minify')"
  exit 1
fi
[ -z "$CAP" ] && { [ "$IS_PI" = 1 ] && CAP=32 || CAP=62; }
note build "$DIR (RES $RES)"
note "fps cap" "$CAP"

QUERY="?cap=$CAP"
[ "$DEBUG" = 1 ] && QUERY="?gpu&uncap&fps"
URL="http://127.0.0.1:$PORT/index.html$QUERY"

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

# --- serve and launch --------------------------------------------------------

python3 -m http.server "$PORT" -d "$ROOT/$DIR" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
sleep 0.5
if ! kill -0 $SERVER 2>/dev/null; then
  echo "server failed to start on port $PORT (in use? try --port)"; exit 1
fi

"${LAUNCH[@]}"

# 'open'/'xdg-open' return immediately - keep serving until interrupted.
case "$BROWSER" in default) echo "  serving until Ctrl-C..."; wait $SERVER ;; esac
