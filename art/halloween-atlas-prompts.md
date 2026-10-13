# Halloween fish atlas

Generated with the built-in imagegen tool. Style references:
`odyssey-fish-atlas-128.png` and `pop-culture-fish-atlas-128.png`.

The transparent source is normalized by `bun run atlas:halloween` into a
3 × 4 atlas with 128px cells and a matching embedded TypeScript module.
Measured empty source gutters determine the extraction cuts; each complete fish
is centered before alpha-weighted 3× downsampling, matching the Odyssey pipeline.

The Halloween set is available in the tank's fish settings, including all twelve
thumbnail previews, and uses the existing species-specific swim animations.
Use `off=fish-halloween` to hide it like any other fish set.

## Generation prompt

Use case: stylized-concept.
Asset type: Halloween fish sprite atlas for an existing pixel-art aquarium game.
Input images: Image 1 (Odyssey fish atlas) and Image 2 (pop-culture fish atlas) are STYLE and GRID references, not edit targets. Create a new sister atlas matching their intricate jewel-like pixel rendering, finely outlined scales, shaded fins, anatomy and charming expressive eyes. This should feel from exactly the same artist and game.
Composition: exactly 12 separate complete fish, 3 columns by 4 rows, aligned to an evenly spaced grid on a truly TRANSPARENT background. Portrait canvas 1152x1536 if possible. Each fish centered in its own cell with wide empty gutters on all sides; no touching, no cropped fins. All fish swim horizontally facing LEFT in full side profile, tail on right, single visible eye. Each sprite occupies roughly 80% of its cell width. Single neutral swim pose.
Ordered subjects row-major:
Row 1: pumpkin jack-o-lantern goldfish with orange ribbed scales, small green stem dorsal fin, glowing golden eye and carved grin; ghost betta with pearly white body and long pale mint spectral veil fins; vampire angelfish with black and burgundy cape-like fins, ivory face and tiny fangs.
Row 2: witch fish with dark purple scales, small crooked black witch hat and emerald fins; skeleton fish with ivory skull, clearly shaped ribs and bony tail while retaining coherent fish silhouette; Frankenstein carp with moss-green scales, tasteful stitched seams, small neck bolts and violet fins.
Row 3: mummy fish wrapped in aged ivory linen with golden eye and teal tail; bat ray with charcoal plum body and spread batlike wing-fins in left-facing side view; candy-corn puffer with rounded cream, orange and yellow scales and small triangular spines.
Row 4: werewolf fish with warm brown shaggy scale texture and pointed fins; spiderweb lionfish with purple body and silver web-patterned delicate fins; grim-reaper fish with charcoal hood-like dorsal fin, small bone-white face and flowing desaturated teal tail.
Style: polished intricate 16-bit fantasy pixel-art sprites, visible crisp pixel clusters, restrained dithering, fine dark contours and bright scale highlights. Match supplied references, not smooth vector icons or 3D cartoon renders. Halloween motifs integrated into fish anatomy, charming spooky tone.
Constraints: real alpha transparency, no background, no checkerboard baked in, no scene, no text, no captions, no grid lines, no watermarks, no detached decorative particles or accessories. Exactly twelve fish.
