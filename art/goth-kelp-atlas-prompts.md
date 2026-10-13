# Goth kelp skin

Generated with the built-in imagegen tool. References: the original luminous
kelp source sheet for component anatomy, and the approved goth plant atlas for
pixel rendering and palette.

`goth-kelp-atlas-transparent.png` is the source. `bun run atlas:goth-kelp` emits
the 4 × 4 atlas of 256px cells, attachment metadata, and embedded runtime module.
The sixteen parts keep the original names, order, center hinges, and attachment
directions. The generator measures opaque stem endpoints without relying on the
original green palette. The goth skin supplies its own measured attachment tips.

**goth kelp** selects the new skin with `goth-kelp=1`; **kelp** remains the
visibility switch. Disabling the skin restores the original luminous kelp.
The existing grove code still controls placement, stem chains, sway, branches,
pods, tendrils, depth ordering, tint, and batched rendering. Goth plants and goth
kelp can be selected independently.

## Generation prompt

Use case: stylized-concept.
Asset type: GOTH KELP modular sprite atlas for an existing pixel-art aquarium.
Input Image 1 is the exact original kelp SOURCE sheet: use it as a STRUCTURAL template, preserving the 4x4 grid, each component's silhouette and growth direction, and its attachment points. Image 2 is the approved goth plants atlas: use its midnight purple, burgundy, bone-white veins and ghostly sage accents as STYLE and PALETTE reference.
Create a new gothic version of the entire kelp species. It must assemble into tall swaying underwater kelp with a continuous narrow stem. Intricate pixel art, organic sinewy black-purple stems, slender serrated wine-red and violet leaves, pale skeletal veins, small curled thorn tips. Elegant eerie botanical kelp, not literal skeletons or animals. Preserve the airy, slender, flowing structure of Image 1 instead of thick bushy blocks.
Exactly 16 complete isolated connected plant components on genuinely transparent square canvas, 4 columns by 4 rows, generous empty gutters, no overlap or clipping. Every stem and root attachment remains visible. Keep each cell's object roughly the same proportions and pose as its counterpart in Image 1.
Row-major component order:
Row 1: rooted holdfast with splayed clawlike roots and a short central shoot, a few small purple glowing bulbs near roots; narrow vertical straight stem section with sparse leaves and exposed bottom AND top central stem ends suitable for stacking; narrow stem section gently curving right at its top, bottom centered; matching narrow stem section gently curving left at its top, bottom centered.
Row 2: left-reaching leafy branch attached at lower right; right-reaching leafy branch attached at lower left; forked Y-shaped crown with single bottom attachment; curved leafy canopy sweeping left, attached at its lower right.
Row 3: second left-sweeping canopy with hooked leaves, single bottom attachment; slender upright feathery tuft with bottom-centered stem; hanging cluster of seven tear-shaped luminous purple seed pods with ghost-mint glints, all hanging DOWN from one exposed top stalk; smaller hanging cluster of three purple seed pods from one exposed TOP stalk.
Row 4: thin trailing tendril hanging DOWN from TOP-centered attachment, with sparse small leaves; forked trailing tendril hanging DOWN from a single TOP-centered attachment; small radial foliage collar with a visible central joining node; elegant broad fan crown growing UP from a single bottom-centered stem.
Every component must remain one coherent connected plant part. Attachment endpoints must be actual stem, no stray leaves at extreme top/bottom of the four trunk components. Stem modules should connect naturally when stacked. Bottom-rooted parts grow up, pods and tendrils hang down, collar attaches at center.
Style: crisp detailed 16-bit pixel-art shading and fine dithering, sharp contours, readable at 119px component height inside a 256px runtime cell. Match the approved gothic plants but with finer kelp blades. Purple seed pods contain their light within the outlines; no detached particles or bloom halos.
Constraints: true alpha transparency, no background or baked checkerboard, no labels/text/grid lines/watermarks, no pots, sand, rocks, scene, fish, faces or unrelated ornaments. Exactly 16 parts.
