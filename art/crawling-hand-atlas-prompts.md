# Crawling hands

Generated with the built-in imagegen tool, referencing the hermit-crab atlas for
game sprite style and the Halloween props atlas for tone. A second imagegen pass
removes the generated background and diffuse halo without changing the poses.

The **crawling hands** checkbox beside **crabs** replaces the crab skin. **crabs**
still controls visibility and population; unchecking **crawling hands** restores
hermit crabs. The query setting is `crawling-hands=1`.

The six poses use the existing distance-driven gait, stable frame 1 at rest,
mirroring, substrate traversal, slope following, obstacle avoidance and sand
puffs. The runtime sheet has six 128px cells. The generator preserves one shared
scale across the poses and aligns their wrist centers and planted fingertips.
Rebuild with `bun run atlas:crawling-hands`.

Source: `crawling-hand-atlas-transparent.png`. Runtime: `crawling-hand-atlas-128.png`.
The manifest records each crop, shared scale, wrist anchor, and ground line.

## Generation prompt

Use case: stylized-concept.
Asset type: six-frame crawling disembodied human-hand walk-cycle sprite atlas for a detailed pixel-art aquarium game.
Input Image 1 is the existing hermit-crab runtime atlas: STYLE, pixel-detail level, SIDE-VIEW and animation consistency reference only. Replace the crab subject entirely. Input Image 2 is the approved Halloween props palette/style reference. New character: one pale human RIGHT HAND crawling on bent fingers, inspired by Thing from the classic Addams Family films. Spooky, humorous, elegant, no gore. Wrist ends in a clean rounded closed skin cap with a subtle old stitched seam; no blood, open wound, exposed tissue or arm. Five anatomically correct digits total: four articulated fingers and one thumb; no extra digits. Back of hand arches like a small body, knuckles leading LEFT, short upright wrist stump at upper RIGHT. Hand reads as natural adult human anatomy, not a glove or claw. Pale warm ivory skin, shaded taupe creases, small muted gray-violet stitches at wrist, natural short nails. All six frames show the exact SAME hand, same size, same camera angle and lighting.
Composition: exactly 6 isolated full hand poses in a REGULAR 3-column by 2-row sprite grid on true alpha transparency, landscape canvas if possible. Each panel square, no borders/labels. Wide transparent gutters. Flat side / slight three-quarter view facing LEFT, showing backs/side of fingers enough to clearly read the walking pose. The wrist remains fixed at the same panel-local x/y and size in every frame; palm rigid and in place; lowest planted fingertips share the same horizontal panel-local baseline. No camera movement, no body translation between poses. Only fingers articulate, thumb stabilizes. Entire hand contained in each cell.
Animation row-major: 1 index finger reaches left while middle and ring bear weight; 2 neutral stable planted pose (also used as idle); 3 middle finger reaches forward as index curls to push; 4 middle plants and ring finger advances while thumb braces; 5 ring plants and index recovers lifted; 6 index extends again to join pose 1 smoothly. Visible distinct alternating finger contact/recovery, small deliberate movements, identity-stable palm/wrist silhouette. Every frame palm occupies same location. Fingers act as walking legs, not a hand lying flat. No radial finger splay, no long arm.
Style: intricate crisp shaded 16-bit pixel art matching reference sprites, fine dark contours and tiny pixel clusters, soft ivory highlights, tactile knuckle and nail details. Readable at roughly 110px wide and 90px tall in 128px runtime cells. No photorealistic rendering, no smooth vector icons.
Constraints: actual transparent background, no checkerboard baked in, no floor or ground shadow, no props, no crab shells or crab legs, no text, no labels, no gridlines, no watermarks. Exactly SIX poses of one right hand, pointing and crawling LEFT.

## Transparency cleanup prompt

Use case: background-extraction. Edit this six-pose pixel-art crawling hand sprite sheet ONLY to remove the entire black/brown background and the soft brown halos/shadows. Output genuine transparent alpha background. Preserve all six hands EXACTLY: identical pixels/colors within each hand, exact poses, anatomy, positions, scale, pixel-art edges, 3 columns by 2 rows, 1536x1024 canvas. Keep the dark narrow pixel outlines that belong to the hands, remove EVERYTHING outside those outlines including all diffuse glows/shadows and all background pixels. The gaps BETWEEN fingers must also be fully transparent. No added text, checkerboard, objects or changes to hands. Clean isolated sprites with crisp alpha edges.
