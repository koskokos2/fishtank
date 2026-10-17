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

Ray sharpness is fixed at 70%. Rays render over the distant city and behind the
middle and foreground ruins, which occlude them.

Three transparent sunken-city artworks sit over the original water gradient,
behind kelp, sand and all creatures: a pale distant skyline, an asymmetric ruined
tidal observatory with a guardian relief, and deeply shaded carved ruins framing the edges.
All three share the observatory's carved spiral-shell and celestial stonework. Each
depth uses a restrained blue palette, retaining masonry and sculptural detail.
The **sunken city** checkbox in the top section hides or restores all three
depths live, independently of the sun, sand, creatures and theme. This choice is
included in shared URLs; older links show the city by default.
The fallen guardian head has a fixed placement on the left dune: horizontal -3,
vertical +50 design pixels, with dithered sand burial and a matching crawler footprint.
Its exclusion follows the burial line and stops at the sculpture's bottom edge,
with body clearance for crabs/hands at every resolution. Sand below the chin stays
walkable; vertical and diagonal trips stop outside the head, and narrow lanes
have a sideways fallback. The exclusion switches off live with the head.
It follows **sunken city** visibility and also hides when sand is disabled.
When the city is enabled, the second and third rotating prop slots from the left
are absent from spawning, collision footprints and the rotation cycle. The first
rotating prop and both fixed consoles remain. Disabling the city restores all six
rotating slots live; rebuilding the prop group cancels its old timers and transitions.
Placement controls have been removed. Retired v4–v6 URL fields still decode safely,
but no longer override this chosen placement. Sand burial is baked once at startup.
Halloween switches all four city assets live: the distant necropolis skyline,
bronze-bell sanctuary, gothic framing ruins and broken veiled funerary head.
The normal city returns when the Halloween preset is removed. Both sets are baked
once and their existing scene objects are reused; switching preserves depth,
day/night shading, the selected head placement and the cleared rotating-prop slots.
The new city art has no flames, candles, torches, lamps or emissive windows.
The v2 artwork uses the normal city's source plates as the reference for texture
scale, carved relief and sharpness; the gothic concept supplies the designs.
Both sets share the same luminance treatment without a Halloween exposure boost.
Sources: `art/halloween-city-{far,middle,near,guardian}-v2.png`; built-in imagegen
prompts: `art/halloween-city-production-v2-prompts.txt`. Rebuild with
`bun tools/embed-sunken-ruins.ts` and `bun tools/embed-city-relic.ts`.
The Halloween head now uses `art/halloween-city-mourner.png`, a veiled cemetery
sculpture with the same placement and burial; the earlier crowned source is
retained for reference. Built-in imagegen prompt: `art/halloween-city-mourner-prompt.txt`.
Only the normal and Halloween heads are bundled; earlier source artwork remains for reference.
Source: `art/sunken-city-landmark-guardian.png`; built-in imagegen prompts:
`art/sunken-city-landmark-prompts.txt`. Run `bun tools/embed-city-relic.ts` to
rebuild the compact embedded sprite.
Distance is conveyed through smaller architecture, overlap and cooler colour;
the far plate retains internal detail, with adjustable opacity for distance.
Foundations are positioned against the real sand contour with a small buried
margin, rather than the viewport bottom. The observatory is scaled to leave
surface clearance, while the nearest ruins overlap the high left dune more.
They are baked once into three independent textures (each capped at 1920×1080,
smaller at lower render resolutions). The chosen appearance is fixed at **30%
distant opacity**, **40% middle distance**, and **15% foreground distance**.
Distance blends stone toward the surrounding nine-stop water gradient, following
daylight. It reduces contrast without blurring edges or revealing structures behind
it; artwork alpha is preserved. The temporary sliders have been removed; the
**sunken city** visibility checkbox remains. Sun brightness updates while paused,
without image generation or texture uploads; the city stays
dimly visible at night. Sources are `art/sunken-city-far-v2.png`,
`art/sunken-city-middle-v2.png`, and `art/sunken-city-near-v2.png`,
with prompts in `art/sunken-city-prompts.txt` and the middle-layer revision in
`art/sunken-city-middle-v2-prompt.txt`; the matching far/near prompts are in
`art/sunken-city-style-v2-prompts.txt`. After changing source artwork, run
`bun tools/embed-sunken-ruins.ts`; composition and palette live in `src/sunkenCity.ts`.
The earlier single-silhouette source is retained in `art/sunken-ruins-source.png`.
The earlier symmetrical middle composition is retained in `art/sunken-city-middle.png`.

The toolbar's **real-time sun** mode is enabled by default and uses the device's
local clock. Rays travel from just beyond the left edge at 04:00 to just beyond
the right edge at 18:00. From 18:00 until 04:00, the backdrop switches off to show
the existing dark night background; dawn restores it. These changes happen live.
**Preview time** overrides the clock until **Use real time** is selected. The URL
records the mode and preview time inside `settings=`, so shared
links reproduce your selection even on another device. Disable the
mode for fixed daytime rays, or click **backdrop** to take manual control live.

Layer checkboxes, fish/object sets, population counts, birthday fish and pause
update live and keep the address bar in sync. Creature counts are capped at 99,
while plants allow up to 999; older shared URLs with higher creature counts are
clamped without discarding their other settings. Only the affected group is rebuilt;
other creatures keep swimming. Goth plants, goth kelp and crawling hands also
switch live; alternate atlases load on first use and stay cached for later switches.
The **Texture filtering** checkbox switches fish, octopus, jellyfish, nautilus,
sea snail, crab, plant and kelp rendering live (including Halloween skins and
crawling hands, plus every jellyfish/nautilus body layer): checked (the default) uses
sharp cubic filtering with B=0, C=1 and no neighborhood halo limiter; unchecked
uses the original nearest sampling. The encoded URL preserves this choice.
Creatures keep their positions, animation, opacity and collision
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
other choices. Turning kelp off or disabling the Halloween/witch fish sets or
Halloween object set keeps Halloween selected, including city and creature skins.
Turning kelp back on restores goth kelp. These choices survive shared URLs/reloads.

Halloween also replaces octopuses with **Plague doctor**, **Possessed doll** and
**Vampire squid** skins, and hides jellyfish, sea snails and nautiluses until the theme is
switched off. The octopus count stays unchanged: one or two use random distinct
skins, three show all three, and higher counts repeat in shuffled groups of three.
Unrelated controls leave those assignments intact. Switching themes is live;
the three textures load once on first use and remain cached.

Each skin has the original 19-frame layout (eight idle sway frames plus eleven
named poses), so crawling, resting, swimming, turning and collision logic is shared
with the ordinary octopus. Rebuild these atlases with
`bun run atlas:halloween-octopus`; source sheets, packed PNGs and frame metadata
are in `art/halloween-octopus-*`, with the generation prompts in
`art/halloween-octopus-prompts.json`. The built-in image generator created the
source artwork; the atlas tool extracts complete silhouettes and packs them into
cells sized to each silhouette without clipping extended arms. Visible pixel area
is matched to the original octopus, so longer tentacles do not shrink the whole skin.

The ordinary purple octopus uses the same detailed rendering style as the
Halloween skins. Its twelve authored poses are in `art/octopus-v2-source.png`,
with the built-in imagegen prompt in `art/octopus-v2-prompt.txt`. Rebuild with
`bun run atlas:octopus`. Both generators share `tools/octopus-atlas-packer.ts`
and match visible size against the frozen `art/octopus-legacy-packed.png`;
regenerating one skin cannot progressively change the size of the others.
The original source artwork remains available in `art/octopus-atlas-128.png`.

Saved tank settings are shared through a single `?settings=<base64url>` parameter. The standard
snapshot is 21 bytes / 28 URL-safe characters, without `=` padding. Version 3 uses
previously reserved bit 41 to hide the sunken city; links that show it retain
version 2, and versions 1/2 still decode with the city visible. Version 4 uses bits
42–43 for the now-retired dune landmark selection. Version 5 used those bits for
guardian position presets. Neither
version increases the snapshot size. Version 6 stored guardian horizontal and vertical
coordinates in bits 42–59. The retired v4–v6 fields are now validated and ignored;
new links use v2/v3 with the guardian fixed in place. The snapshot includes layers,
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

Ground-creature movement regressions run without rendering via
`bun test tools/crawler-soak.test.ts`. For a longer soak, run
`bun tools/crab-soak.ts --days=21 --assert-moving` (or add `--creature=snail`
or `--creature=hand`). This runs the real movement, terrain and rotating-prop
controllers with 20 creatures and the seabed finds set, records stalls and
unreachable destinations in `test-results/crab-soak.json`, and fails if either
occurs. `--fps=60` changes the simulation step; it never skips ahead in large
time jumps. Destination depths are revalidated when props redirect crabs,
crawling hands or snails onto a different part of the sand bed.

Use `--creature=octopus` or `--creature=halloween-octopus` for 20 octopuses
(the latter distributes all three Halloween skins). These runs also check
swim/landing cycles, frame indices, tank boundaries and unusually long swims.
The five-minute stall threshold allows their normal rests of up to 100 seconds.
This validates controller behavior without drawing or loading sprite textures.


```sh
bun run preview:caustics
# Or choose an output directory after building:
bun tools/preview-water-lighting.ts /tmp/water-preview
```

This uses installed Chrome (or `PLAYWRIGHT_CHANNEL`) to capture the real WebGL
shader into `test-results/water-lighting/`. It checks repeatable stills, live
animation, loop continuity, long-running phase stability, both visibility gates,
the sidebar toggle, oversized bright bands at multiple animation times and depths,
and RES=1/2/3/6. Lighting uses a gradient pass behind the city and a transparent
ray pass between the far and middle ruins; its cost appears under **backdrop**
in the performance panel. Tune the broad-ray threshold,
light intensity and source position in `src/waterLighting.ts`.

The **witches** fish set adds twelve goth witches inspired by `grim_reaper_fish`,
with pale faces, dark hats and hoods, and flowing veil fins. Toggle it live in
**fish sets**; the encoded URL preserves its visibility. The legacy
`off=fish-witches` parameter is still accepted. Rebuild the atlas
with `bun run atlas:witches`, or inspect its swim frames with
`bun tools/preview.ts SET=witches S=1 OUT=/tmp/witch-swim-preview.png`.
