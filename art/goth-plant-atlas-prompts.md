# Goth plant skin

Generated with the built-in imagegen tool, using the original plant atlas as
the component reference and the Halloween props atlas as the style reference.

Source: `goth-plant-atlas-transparent.png`. Runtime: `goth-plant-atlas-128.png`.
Rebuild with `bun run atlas:goth-plants`.

Sixteen rooted components use the same names and frame order as the original
4 × 4 plant atlas. Measured transparent gutters preserve each complete frond.
The existing plant normalization preserves bottom-root anchoring and a four-row
dithered root fade; the runtime uses the selected atlas's measured bounds.

The sidebar's **goth plants** checkbox sets `goth-plants=1` and reloads, following
the existing settings behavior. It replaces the single plant atlas used by
clusters, foreground clumps and individual shoots. **plants** remains the
visibility switch for either skin. Counts, sway, tint, opacity, depth ordering,
batched drawing and bubble behavior use the same code for both skins.

Preview:

```sh
bun tools/preview.ts MODE=plants PLANT_STYLE=goth PROP_FAMILY=halloween OUT=/tmp/goth-plants-scene.png
```

## Generation prompt

Use case: stylized-concept.
Asset type: modular GOTH PLANTS sprite atlas for the existing pixel-art aquarium.
Input Image 1 is the exact structural reference: existing plants atlas, 4 columns x 4 rows, each component rooted bottom-center. Image 2 is the approved Halloween props atlas for pixel-art style and palette. Create a matching alternative atlas with scary gothic underwater plants. These will REPLACE the ordinary plant components and sway identically, assembled as living fronds.
Composition: square canvas, exactly 16 isolated botanical components, evenly spaced 4x4 grid, actual alpha transparency. Each cell contains one complete narrow plant frond, stem or compact base, upright with its root pointing down at horizontal cell center. All silhouettes fit fully within their own cell with generous transparent gutters. Rows 1-3 tall slender components, row 4 short clump bases. Match the reference proportions, heights and single-stem anatomy precisely. No rocks, pots, soil, sand, platforms or background: only plant material, tiny tapered roots. Root/stem grows up from bottom-center of each object, no detached parts. Strong readable shapes for 128px cells. Keep leaves delicate enough to sway like seaweed.
Exact row-major designs corresponding one-to-one to the reference:
Row 1 ribbon fronds: long thorn-edged midnight-purple blade curving left with pale lavender veins; burgundy S-curve ribbon with tiny bat-wing serrations; upright twisting black-violet eelgrass with sickly mint vein highlights; long dark crimson hooked blade curving right.
Row 2 broad fronds: single pointed near-black purple leaf with ivory skeletal veins; jagged wine-red kelp blade with thorny lobes; single ghostly pale sage lance leaf with purple central vein; curling crimson-black leaf with pointed flame-shaped lobes.
Row 3 branching stems: fine skeletal fern with ivory-lilac leaflets on black stem; dark violet thorny hornwort sprig with muted mint growing tips; forked dark burgundy branch with small curled claw-shaped leaves; intricate plum and rust-orange feathery seaweed stem.
Row 4 compact bases: short fan of black-violet hooked blades; low rosette of dark crimson leaves with ivory veins; irregular low charcoal-purple moss tuft with muted ghost-green tips; single curled purple fiddlehead shoot with bone-colored inner spiral.
Style: intricate crisp shaded pixel art, small visible pixel clusters, fine dithering, delicate dark outlines, botanical detail, 16-bit fantasy aquarium artwork matching references. Haunting, eerie, organic, elegant. Keep purple/crimson/pale veins bright enough to read against deep blue water and black foreground tint. No cartoon faces, eyes or animals; scary plant forms and veins instead.
Constraints: exactly 16 components in 4x4 grid, no text, no captions, no grid lines, no watermark, no checkerboard baked into image, no detached glow particles, no soft halo, no cropping. Each plant is one connected silhouette with a centered root.
