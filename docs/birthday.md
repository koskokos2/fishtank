# Scheduled birthday fish

With **Birthday fish (scheduled)** checked, three birthday fish join the aquarium
from **24 October 2026 at 08:00 Europe/London** onward. There is no automatic end
date. Unchecked means they never appear, including on October 24. This replaces
the previous annual October 24 rule and always-show override.

## Artwork and atlas

The fish use the same shaded pixel-art style, WebGL canvas, shared swimming
controller and `groundZ` depth ordering as the other fish.
There is no birthday DOM layer, SVG, CSS layout or separate mobile layout.

![Birthday fish in the aquarium](birthday-preview.png)

- **Gold:** a fancy goldfish with orange ribbon fins and a small jeweled crown;
  its code opens https://x.kns.li/bd1.
- **Cake:** a pink/lavender discus with cream scale markings and three
  candle-inspired dorsal tips; its code opens https://x.kns.li/bd2.
- **Confetti:** a turquoise/violet fish with confetti scales, a striped party
  hat and streamer fins; its code opens https://x.kns.li/bd3.

The original fish source is `art/birthday-fish-source.png`, created with the
built-in image_gen tool using `art/fish-extra-atlas-128.png` as the style reference.
The current source is `art/birthday-medallion-source.png`: a generated edit that
integrates jeweled medallions into the flanks. Exact prompts are saved in
`art/birthday-medallion-prompt.txt` (original: `art/birthday-fish-prompt.txt`).
Source row boundaries, QR anchors, enamel palettes and tail pivots are recorded
in `art/birthday-fish-source.json`. Explicit row boundaries preserve the middle
fish's candle tips. `art/birthday-medallion-preview.png` shows the finished codes.

`bun run birthday:atlas` regenerates the real QR matrices and the atlas. The
normalizer preserves transparency and samples with nearest-neighbour filtering.
The runtime atlas has 24 frames: three species × two directions × four tail-beat
poses, packed in a 1440×1728 page. It is embedded in `src/birthdayFishAtlas.ts`,
following the existing offline asset pipeline. The generated manifest records
source bounds, stable pivots and QR rectangles. `art/birthday-fish-normalized.png`
provides an art-only review sheet.

## Swimming and scanning

These are gently swimming residents: they accelerate and coast, turn, change
depth, and take 5–8 second hover breaks between swims. They have no proximity
sensors and are excluded from chase targets, so they pass through other fish
without collision avoidance or separation interrupting their swimming.
Gold swims in the left third, cake in the middle third, and confetti in the
right third, with staggered depth preferences. Each fish turns within its own
territory, including room for its full sprite, so they stay spread out throughout
the day instead of eventually gathering in one spot. These territories are part
of their swimming controller and do not re-enable fish collisions.
They use the normal fish controller, with birthday-specific settings to avoid
panic darts and sand dives. The full sprite stays inside the tank: early wall
steering is backed by containment after movement.
Normal fish keep their existing behavior and off-screen replacement rules.

Each birthday fish sheds small magical sparkles around its fins and tail: gold,
rose/lavender, and mint/violet respectively. They rise, drift and twinkle, with
more emission while swimming and a few during hovers. Like the sand puffs, these
are crisp pixel particles drawn by a single lightweight object per fish (at most
112 particles each). They render behind the fish so the QR stays unobscured, fade
within 2.6 seconds, and are removed with their owner. The existing `puffs` setting
also controls these particles.

![Birthday sparkle trails](birthday-sparkles-preview.png)

The central body remains level and rigid while the tail animates. The generator
mirrors the artwork first, then stamps an upright QR into every frame; the engine
switches direction strips instead of mirroring the finished sprite. Thus turning
never mirrors the code, and animation never bends or rotates it. Each code uses
25×25 modules (QR version 2, error correction M), surrounded by four untouched
plain enamel modules on every side. The 66px inset at the default render density
uses two pixels per module and follows the scene's resolution scale. Its smaller
footprint fits inside the generated rim without covering fins or gems. The three
palettes are dark brown on honey gold, plum on rose, and deep teal on seafoam.
Only the rim and surrounding scales have shading; there are no gradients,
textures or highlights in the QR or its quiet zone. The birthday fish are larger
than most ordinary fish to accommodate the medallions, but use the same world
coordinates.

At render resolutions 1 and 2, birthday fish scale up relative to the scene so
each QR module still occupies a whole number of world pixels. The default
resolution 3 and resolution 6 keep their original fish size. This avoids losing
modules to nearest-neighbour downsampling.

Fish, plants and props can pass in front of birthday fish through ordinary depth
ordering. They remain resident all day, but an occluded code may require waiting
for an open-water hover. Clicking a fish opens its URL in a new tab without
removing it. The scenery and fish animation continue around them.

## Schedule, persistence and settings

Open the settings gear and check **Birthday fish (scheduled)** to enable the
start time. Before that time the fish remain hidden even when checked. As with
other scene settings, this reloads the page and preserves the checkbox in the
URL (`?birthday=1`). Unchecking hides the fish at all times. The setting survives
reloads and is separate from the ordinary fish population and “all” toggles.

A calendar controller owns exactly one of each birthday species. They never join
the random spawning pool and never invoke the ordinary replacement callback.
Reloads reconstruct all three from the checkbox and start time, without cookies
or storage. `src/birthdayDate.ts` stores the instant as
`2026-10-24T08:00:00+01:00` (07:00 UTC), since London is on BST that day. All
viewers use that same instant regardless of their device timezone. The controller
wakes at the start, checks clock changes at least every 30 seconds, and reconciles
on focus, visibility changes and page restoration. Missing residents are restored
while enabled and after the start. A sleeping/suspended browser reconciles when
execution resumes. Moving the clock back before the start hides the fish again.

## Verification

Run `bun run test:birthday` with Google Chrome installed. Alternatively install
Playwright Chromium with `bunx playwright install chromium` and run
`PLAYWRIGHT_CHANNEL=chromium bun run test:birthday`.

Tests decode all 24 atlas frames with an independent QR decoder, validate quiet
zones and transparent gutters, and decode the actual desktop canvas in both
facing directions at desktop sizes and all four supported render resolutions.
They verify normal scene occlusion, movement, depth ordering,
containment in a crowded tank, unique identities, reloads without storage,
the exact scheduled start, three device timezones, restoration after sleep, the
checkbox's on/off behavior, and all three canvas links. The browser fixture exposes engine
inspection only in the test entry; production keeps the engine off `window`.

Desktop screenshots are saved under `test-results/`. Automated decoding is not
a claim of physical phone-camera testing. Once the scheduled time has arrived,
enable the checkbox to scan the codes on the target desktop/kiosk display.
