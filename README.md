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
