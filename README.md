# fishtank

An ambient pixel-art fish tank for when your computer should be doing less.

Fish drift. Bubbles rise. Plants sway. The whole thing keeps going.

**Demo:** <https://fish.kns.li>

![Fishtank screenshot](docs/screenshot.png)

## What it is

- A web page.
- A Linux desktop executable.
- Pixel art, procedural reef, embedded atlases.
- No menus. No settings. No engagement loop. Mercifully.

Enable “Birthday fish (scheduled)” to show three permanent fish with scannable
surprise links from 24 October 2026 at 08:00 Europe/London onward. When unchecked,
they never appear. See [birthday designs, schedule, and verification](docs/birthday.md).

## Run it

```sh
bun install
bun run dev
```

## Build it

```sh
bun run build
bun run compile
```

## Raspberry Pi kiosk mode

On Raspberry Pi Linux, Cog/WPE can fail before Fishtank renders with messages like
`Failed to bind wl_compositor`, `wl_drm authenticate failed`, or
`EGLDisplay Initialization failed: EGL_NOT_INITIALIZED`. That is the Pi's
WPE/Wayland/EGL stack failing to create a renderer, not a Fishtank asset or game
loop error.

Use the browser target as the reliable Pi path:

```sh
bun install
bun run serve
```

Then open `http://localhost:8421/`, or launch Chromium fullscreen:

```sh
chromium-browser --kiosk http://localhost:8421/
```

If you still want to use Cog/WPE, run it inside a working local Wayland/DRM
session and make sure the Pi user is allowed to access GPU devices, for example
by adding it to the `video` and `render` groups and logging in again.

## Check the art without opening a browser

```sh
bun tools/preview.ts
bun tools/preview.ts MODE=backdrop
```

Bun is the package manager, dev server, bundler, and compiler because adding
three more tools would be funny in the bad way.

## Preview the water lighting

The **caustics** checkbox controls the descending sunlight rays. The water
surface texture has been removed. `?off=caustics` disables the rays; `off=water-light` remains a
legacy alias. `?light-time=12` freezes just the lighting at 12 seconds; remove
that parameter to resume its slow light motion. The backdrop uses a fixed seed.

Ray sharpness is fixed at 70%.

The toolbar's **real-time sun** mode is enabled by default and uses the device's
local clock. Rays travel from just beyond the left edge at 04:00 to just beyond
the right edge at 18:00. From 18:00 until 04:00, the backdrop switches off to show
the existing dark night background; dawn restores it. These changes happen live.
**Preview time** temporarily overrides the clock for the current page; **Use real
time** returns to the clock. Only the mode is saved across reloads. Disable the
mode for fixed daytime rays, or click **backdrop** to take manual control live.

```sh
bun run preview:caustics
# Or choose an output directory after building:
bun tools/preview-water-lighting.ts /tmp/water-preview
```

This uses installed Chrome (or `PLAYWRIGHT_CHANNEL`) to capture the real WebGL
shader into `test-results/water-lighting/`. It checks repeatable stills, live
animation, loop continuity, long-running phase stability, both visibility gates,
the sidebar toggle, oversized bright bands at multiple animation times and depths,
and RES=1/2/3/6. Lighting renders in the backdrop pass; its
cost appears under **backdrop** in the performance panel. Tune the broad-ray threshold,
light intensity and source position in `src/waterLighting.ts`.
