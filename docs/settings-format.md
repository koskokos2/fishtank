# Aquarium settings wire format

The sole output query parameter is `settings`, containing unpadded Base64url
(`A–Z`, `a–z`, `0–9`, `-`, `_`; case-sensitive). Earlier hexadecimal snapshots
are accepted in either case and normalized to Base64url. This is a binary snapshot, not JSON,
compression, or encryption. `src/settingsCodec.ts` owns the pure codec and legacy
migration; `src/settings.ts` owns browser state and URL persistence. Scene modules
and controls read typed state rather than parsing the URL independently.

## Version 2 (current), with version 1 compatibility

The standard payload is exactly 21 bytes (28 Base64url characters; formerly 42 hex characters). Byte and bit offsets
are zero-based. Multi-byte numbers are little-endian. Within bit fields, the least
significant bit comes first.

| Bytes | Contents |
| --- | --- |
| 0 | Version: `02` (legacy `01` accepted) |
| 1–8 | 64 flags: bits 0–29 are disabled gates; bits 30–40 are booleans; bits 41–63 reserved, zero |
| 9 | Bits 0–1 resolution; bits 2–3 frame cap; bit 4 fixed lighting time present; bits 5–7 reserved, zero |
| 10–18 | Seven consecutive 10-bit counts; final two bits reserved, zero |
| 19–20 | Sun preview minutes, 0–1439, or 2047 for real time; other values invalid |
| Optional | Custom frame cap as float64, followed by fixed lighting time as float64, when present |

Resolution codes 0–3 mean 1×, 2×, 3×, 6× the 640×360 design grid. Frame-cap codes
0–3 mean 62, 32, uncapped, custom. The 62/32 values preserve the existing renderer
settings displayed as 60/30 in the sidebar. Custom caps must be finite and
nonnegative; fixed lighting time must be finite and nonnegative seconds. Each
optional field adds 8 bytes, giving lengths 21, 29 or 37 bytes. These encode to
28, 39 or 50 Base64url characters respectively (legacy hex: 42, 58 or 74).

Counts are fish, jelly, octo, naut, crabs, snail, plants, in that order, each 0–999.
The default counts are 10, 5, 1, 1, 5, 1, 100. All values are explicit in a snapshot.

Disabled gate bits 0–29, in order:

```
backdrop sand props plants caustics motes bubbles puffs fish cephs crabs kelp
fish-main fish-extra fish-bonus fish-alien fish-pop-culture fish-odyssey
fish-giger fish-halloween fish-witches
obj-sci-fi obj-eldritch obj-star-wars obj-pop-culture obj-odyssey obj-giger
obj-halloween obj-grindelwald obj-small
```

Boolean bits 30–40, in order:

```
birthday gothPlants gothKelp crawlingHands smoothTextures realTimeSun
paused debug fps gpu halloweenBubbles
```

The disabled backdrop bit records the manual choice. With real-time sunlight
active, effective backdrop visibility is computed from local time; sunset never
rewrites the snapshot. Encoded sunlight values override local storage preferences.
A fresh/legacy URL without a sunlight choice may use the saved device preference.

Version 2 adds Halloween bubbles at bit 40. Version 1 retains its original reserved
bits and decodes with Halloween bubbles disabled. Old links normalize to version 2;
the payload length and all prior bit assignments stay unchanged.

Frozen version-1 default test vector (still accepted):

```
Base64url: AQAAAAAMAAAAAgoUEEAABQRABv8H
Legacy hex: 01000000000c000000020a1410400005044006ff07
```

Version-2 default: `AgAAAAAMAAAAAgoUEEAABQRABv8H`.

## Compatibility and validation

Never derive bit assignments from sidebar order. Version-1 assignments and meaning
are permanent, including defaults used when migrating legacy links. For schema
changes, add a new encoder/decoder version and retain old decoders; do not silently
reuse reserved bits with new semantics in version 1.

Legacy query parameters are accepted only when `settings` is absent. `off=all`
expands into all disabled gates and manual night; `off=water-light` maps to
`caustics`. Population values retain the old normalization into 0–999. Custom caps
and `light-time` are preserved by optional fields. Unknown parameters are dropped.

V1 hex and Base64url lengths do not overlap, so the decoder distinguishes them
without a prefix or version change. Base64url input must use the URL-safe alphabet,
omit padding, and have zero unused bits in its final character. Hex input must use
valid hexadecimal digits. Both require a supported version, the exact expected length,
zero reserved bits, and valid field values. Bad encoded input falls back to the
complete default configuration, ignoring accompanying legacy fields and device
preferences. Decoding allocates at most 37 bytes. Normalization uses
`history.replaceState`, retains path and fragment, and creates no history entry.
Live updates preserve the scene; resolution/frame-cap changes still navigate to
the full encoded snapshot because those renderer options are fixed at startup.
