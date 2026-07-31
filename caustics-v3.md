# Caustics v3 — match the reference dome cap

Goal: the surface caustics should read as a compact spherical cap of fine
concentric arcs around the light hotspot (reference screenshot), not thick
ribbons stretching to the screen edges. Rays are fine as-is; only the
`surface` pass changes.

## Diagnosis — why the current caustics read "flat sheet stretched to the edges"

1. **The field reaches the screen edges.** `radialHorizontalScale: 1.0` +
   `radialFadeEnd: 0.54` means the radial mask only hits zero ±54% of screen
   width from the emitter — effectively the whole screen. In the reference the
   caustic cap occupies roughly the central 55–60% and the left/right thirds
   are almost clean gradient.

2. **The bottom boundary is a straight horizontal cut.** `surfaceZone` is a
   flat y-band (`zoneStart 0.05 → zoneEnd 0.15`) multiplied over everything,
   so the pattern ends on a horizontal line across the full width. The
   reference's caustic field is deepest directly under the light and shallower
   to the sides — a curved cap silhouette, which is most of what makes it
   "read like a sphere."

3. **The `horizontalPhase` field is screen-space, not dome-space.** It's
   driven by `p.y * horizontalFrequency`, so it produces full-width horizontal
   streaks — the parallel lines running to both edges in the lower half of the
   band. This is the single biggest "stretching to the ends" contributor.

4. **Strokes are ~3× too heavy.** `primaryWidth 0.17` + `primarySoftness 0.2`
   (and the 0.4-wide halo) produce thick meandering ribbons. The reference
   lines are fine filaments, 2–4 px at 1080p, broken into dashes.

5. **Warp destroys the concentric structure.** `primaryPhase` *is* radial
   (concentric rings around the emitter — the right skeleton), but
   `warpAmountA 0.9` / `warpAmountB 0.52` displace it by more than a full ring
   spacing, so the rings degenerate into worms with no consistent curvature
   center. In the reference every arc visibly bows around the hotspot.

6. **Uniform 2.65:1 vertical squash.** `domeScale [1.0, 2.65]` flattens the
   whole pattern equally, which reads as a stretched flat sheet. A sphere read
   wants near-circular arcs at the center with flattening that *increases*
   toward the rim (foreshortening). The existing `r + r³·curvature` term is
   the right mechanism but is too weak (`0.85`) relative to the squash.

## Technical requirements

**R1 — Elliptical cap containment.** The caustic field must be exactly zero
outside an elliptical cap centered on `u_emitterX`: horizontal half-extent
≈ 0.30–0.34 of screen width, depth under the emitter ≈ 0.20–0.24 of screen
height, tapering to ~0.05 at the cap's horizontal extremes. No caustic pixel
may appear beyond ±0.40 of the emitter.

**R2 — Curved lower boundary.** The visible bottom edge of the field must be
convex-down (deepest under the emitter). A straight horizontal termination
anywhere along the boundary is a failure.

**R3 — Concentric arc identity.** The dominant lines must read as arcs whose
curvature center is the emitter hotspot. Warp displacement must stay under
~¼ of ring spacing so arc identity survives; the two secondary fields may
only accent, never dominate.

**R4 — Foreshortening.** Arcs near the hotspot are near-circular (≤ ~1.5:1
flattening); flattening and ring compression increase with cap radius (keep
the `r + r³` sphere coordinate, strengthen it). No uniform 2.6:1 squash.

**R5 — Stroke weight & fragmentation.** Line cores ≈ 2–4 px at the 1920×1080
virtual buffer, broken into dashes — no continuous ribbon longer than ~15% of
screen width. Halos scale down proportionally.

**R6 — No screen-space horizontal field.** Lower-fringe horizontal-ish dashes
must emerge from flattened outer *arcs*, not from an independent
`p.y`-frequency field.

**R7 — Radial brightness/color falloff.** Peak white confined to the hotspot
(radius ≈ 0.08); outer third of the cap ≤ ~35% of peak intensity, shifting
white → aqua outward. Rays keep their current look.

**R8 — Preserve invariants.** Whole-pixel quantization to the virtual buffer,
grain cells, exact-zero masks with the scanline-coherent early-out branch,
`u_emitterX` day drift (the cap must follow it, including half-visible at the
edges), the `animationLoopSeconds` period, and single-pass cost — no new
textures or passes.

## Recommended changes

### Structural (two small shader edits)

- **Replace `surfaceZone × radialFocus` with one elliptical cap mask** —
  `capR = length((p.x − u_emitterX, p.y − apertureY) * vec2(hScale, vScale))`,
  `capMask = 1 − smoothstep(capStart, capEnd, capR)`. Use `capMask` (and its
  square as `hotspot`) everywhere `surfaceZone`/`radialFocus` appear, and
  derive the early-out branch from the cap's max depth/width instead of the
  flat `p.y < zoneEnd`. This satisfies R1, R2, R7 in one move and deletes a
  mask rather than adding one.
- **Kill or re-base `horizontalPhase`** — either drop the third field entirely
  (primary + secondary may be enough at thin widths) or drive it from
  `sphereCoordinate` instead of `p.y` and gate it by `capMask²`. Satisfies R6.

### Tuning (starting values, dial in visually)

| knob | now | try | why |
|---|---|---|---|
| `domeScale` | `[1.0, 2.65]` | `[1.0, 1.8]` | R4 — arcs near-circular at center |
| `domeCurvature` | `0.85` | `1.6` | R4 — rim compression does the flattening instead |
| `primaryWidth` / `primarySoftness` | `0.17 / 0.2` | `0.07 / 0.09` | R5 |
| `secondaryWidth` / `secondarySoftness` | `0.12 / 0.17` | `0.06 / 0.08` | R5 |
| `haloWidth` | `0.4` | `0.22` | R5 |
| `warpAmountA` / `warpAmountB` | `0.9 / 0.52` | `0.35 / 0.18` | R3 |
| cap `hScale` / `vScale` (replaces `radialHorizontalScale 1.0` / `radialVerticalScale 2.05`) | — | `~1.55 / ~2.4` with `capEnd 0.5` | R1 — reach ≈ ±0.32 wide, ≈ 0.21 deep |
| `fragmentA` smoothstep | `(-0.42, 0.62)` | `(-0.1, 0.7)` | R5 — more dash, less worm |
| `zoneEnd` | `0.15` | delete (early-out from cap depth, ~0.24 at center) | R2 |

Suggested order: the two structural edits first, then thin the strokes (R5),
then tune warp/curvature last — thick warped lines mask everything else, so
judging warp before thinning is wasted iteration.

## Verification

This shader has no headless preview path, and HMR serves stale modules —
judge each iteration on `bun run build` + fresh browser load. Acceptance
checks against the reference:

- (a) left/right thirds of the frame free of caustics
- (b) bottom boundary visibly curved
- (c) every major line's curvature points back at the hotspot
- (d) pattern still whole-pixel and cheap (same single fragment pass, and the
  early-out still skips most of the tank)

Trade-off to flag: the reference also shows caustic arcs interleaving with the
ray fan near the top (rays start *between* arcs). That should emerge from thin
arcs + the existing rays — don't add explicit coupling until the above lands
and is re-compared.
