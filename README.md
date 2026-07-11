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

## Check the art without opening a browser

```sh
bun tools/preview.ts
bun tools/preview.ts MODE=backdrop
```

Bun is the package manager, dev server, bundler, and compiler because adding
three more tools would be funny in the bad way.
