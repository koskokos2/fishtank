# Halloween props atlas

Created with the built-in imagegen tool, referencing the Eldritch and Odyssey
prop atlases for rendering and the approved Halloween fish atlas for palette.

`halloween-props-atlas-transparent.png` is the preserved source. Run
`bun run atlas:halloween` to rebuild both Halloween atlases. Props use a 4 × 3
grid of 128px cells, measured transparent source gutters, alpha-weighted 3×
downsampling, and the existing 18px dithered burial band for seabed blending.
The generated module records content and contact bounds for ground placement.

All twelve ornaments participate in the rotating seabed pool. The Halloween
object setting includes thumbnails; `off=obj-halloween` disables this family.
Preview in the tank with:

```sh
bun tools/preview.ts MODE=plants PROP_FAMILY=halloween S=1 OUT=/tmp/halloween-props-scene.png
```

## Generation prompt

Use case: stylized-concept.
Asset type: Halloween seabed decoration sprite atlas for an existing pixel-art aquarium game.
Input images: Image 1 and Image 2 are existing Eldritch and Odyssey prop atlas STYLE references. Image 3 is the approved Halloween fish atlas, a PALETTE and THEME reference. Create a new sister props atlas. Match the intricate 16-bit pixel rendering, tiny crisp details, outlined contours, shaded dimensional objects and compact sandy bases. Match the fish's pumpkin orange, burgundy, emerald, purple, ivory and dark teal accents.
Composition: landscape transparent canvas, exactly 12 complete isolated props in an evenly spaced 4 column by 3 row grid. Each centered within its cell, wide genuinely empty gutters on every side, no clipping or overlap. Each prop roughly 75-80% of cell width and height. Grounded small aquarium ornaments, slightly elevated front three-quarter view, visible compact oval base with sparse pebbles and tiny seaweed sprigs, same scale and perspective as reference props. Bases should be shallow and narrow, no large terrain slabs.
Exact row-major subjects:
Row 1: carved orange jack-o-lantern with amber inner light and twisting green stem; weathered crooked gravestone with a small carved skull relief and moss, NO letters; squat black iron witch cauldron with luminous emerald potion and a few attached bubble shapes above rim; antique wrought-iron lantern containing a small pale mint ghost flame.
Row 2: aged ivory skull beside two bones on sand, charming spooky ornament; closed weathered burgundy vampire coffin leaning slightly upright, ornate brass trim and small bat crest; purple crooked witch hat resting against a short old broom; cluster of three melted ivory candles with orange flames on a tarnished bronze holder.
Row 3: small crooked haunted-house aquarium ornament with dark slate roof, purple walls, amber windows and an arched fish doorway; squat glass potion bottle with purple liquid, cork stopper and small moon-shaped brass charm; broken gothic iron cemetery gate with two low stone posts and delicate spiderweb in its upper corner; small open orange pumpkin candy bucket filled with cream-orange-yellow candy corn.
Style: elaborate polished fantasy pixel art matching reference game assets exactly. Tiny pixel clusters, fine dithering, warm highlights, dark crisp outlines, tactile stone/metal/cloth, readable at 128px per cell. Charmingly spooky. These are static props, no fish, no floating scene.
Constraints: true alpha transparency, no background color, no baked checkerboard, no text, no labels, no grid lines, no watermark, no detached particles, no cast shadow outside each base. Exactly twelve props, full objects and bases visible, separated by generous transparent gutters.
