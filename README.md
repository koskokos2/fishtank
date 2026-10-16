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
**Preview time** overrides the clock until **Use real time** is selected. The URL
records the mode and preview time inside `settings=`, so shared
links reproduce your selection even on another device. Disable the
mode for fixed daytime rays, or click **backdrop** to take manual control live.

Layer checkboxes, fish/object sets, population counts, birthday fish and pause
update live and keep the address bar in sync. Only the affected group is rebuilt;
other creatures keep swimming. Goth plants, goth kelp and crawling hands also
switch live; alternate atlases load on first use and stay cached for later switches.
The **Texture filtering** checkbox switches fish, plant and kelp rendering live
(including goth variants): checked (the default) uses
sharp cubic filtering with B=0, C=1 and no neighborhood halo limiter; unchecked
uses the original nearest sampling. The encoded URL preserves this choice.
Fish keep their positions, animation and collision
sizes when switching; plants and kelp keep their roots, joints and sway.
Smooth fish rotate continuously using their eased swimming pitch; Pixelated keeps
the original 7° steps to reduce pixel shimmer. Authored birthday/QR strips retain their pixel rendering.
The shader reuses the packed textures and masks neighboring frames; it adds GPU
work but no duplicate atlases. Plant and kelp pieces share atlas-level filter
uniforms to preserve batching.

Resolution and frame cap still reload because they configure the renderer at startup.

**night sparkles** replaces bubbles with rising violet, amber and green sparks
and intermittent sparkler showers, only while sun rays are not visible (night or
manually disabled backdrop/caustics), independently of the **bubbles** checkbox.
Daytime restores regular bubbles and drifting motes if **bubbles** is enabled;
otherwise both stay hidden. Night sparkles switch live and share through the URL.
A single controller reuses fixed pools
of up to 31 rising lights and 192 short-lived embers.

The **theme** dropdown defaults to **no theme**. **halloween** selects only the
Halloween/witch fish sets and Halloween prop set, enables goth plants and kelp,
crawling hands and night sparkles, and enables their scene layers. Goth plants,
goth kelp and crawling hands are controlled through the theme, without individual
sidebar controls. Counts,
graphics, bubbles, birthday scheduling and sun settings stay unchanged. **no theme** restores
all fish/prop sets and ordinary skins. Presets are stored through their existing
settings; customizing them makes the dropdown show **no theme** without resetting
other choices.

All settings are shared through a single `?settings=<base64url>` parameter. The standard
version-2 snapshot is 21 bytes / 28 URL-safe characters, without `=` padding. It includes layers,
fish/prop sets, skins, filtering, populations, sunlight and preview time, pause,
resolution, frame cap and debug flags. Controls update it without reloading except
for resolution and frame cap. Old query strings (including the examples above)
and earlier hex snapshots are still accepted and rewritten to Base64url in place;
when both encoded and legacy query formats are supplied,
`settings` wins. Encoded sunlight settings override device preferences. Invalid or
unsupported encoded data falls back to defaults. The path and URL fragment survive
normalization; unknown query parameters are discarded.

See [the binary format](docs/settings-format.md) for the stable bit layout and
compatibility rules. Run `bun test tools/settings-codec.test.ts` for codec checks
and `bunx playwright test tests/settings.spec.ts` for browser behavior.


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

The **witches** fish set adds twelve goth witches inspired by `grim_reaper_fish`,
with pale faces, dark hats and hoods, and flowing veil fins. Toggle it live in
**fish sets**; the encoded URL preserves its visibility. The legacy
`off=fish-witches` parameter is still accepted. Rebuild the atlas
with `bun run atlas:witches`, or inspect its swim frames with
`bun tools/preview.ts SET=witches S=1 OUT=/tmp/witch-swim-preview.png`.
