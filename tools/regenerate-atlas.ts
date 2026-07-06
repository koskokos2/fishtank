// Regenerate a designer/reference atlas at its runtime cell scale with model-native
// transparency. This intentionally performs no raster resizing and no background
// removal: it delegates the redraw to the bundled OpenAI image CLI.
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { decodePng, encodePng } from "./png.ts";

type LayoutSprite = { name: string; row: number; col: number };
type Layout = {
  columns?: number;
  rows?: number;
  tileSize?: number;
  sprites?: LayoutSprite[];
};

type Options = {
  input?: string;
  output?: string;
  layout?: string;
  columns?: number;
  rows?: number;
  tileSize?: number;
  canvasSize?: string;
  padding?: number;
  extra?: string;
  dryRun: boolean;
  force: boolean;
  printPrompt: boolean;
};

const USAGE = `
Regenerate an atlas from a designer image using native model transparency.

Usage:
  bun tools/regenerate-atlas.ts \\
    --input <designer.png> \\
    --layout <atlas.json> \\
    --output <atlas.png> [options]

Required:
  --input <path>          Designer/reference image supplied to the model
  --output <path>         Native-alpha PNG to create
  --layout <path>         JSON with columns, rows, tileSize, and optional sprites
                          (or pass --columns, --rows, and --tile-size explicitly)

Options:
  --columns <n>           Number of usable atlas columns
  --rows <n>              Number of usable atlas rows
  --tile-size <px>        Final runtime cell size; defaults to layout.tileSize
  --canvas-size <size>    1024x1024, 1536x1024, or 1024x1536; auto-selected
  --padding <px>          Minimum transparent inset inside every cell
  --extra <text>          Extra art-direction constraint
  --print-prompt          Print the generated prompt without calling the model
  --dry-run               Print the image API request without calling the API
  --force                 Replace an existing output
  --help                  Show this help

The usable atlas begins at (0,0). If the model canvas is larger than columns *
tile-size by rows * tile-size, the verified empty right/bottom area is cropped
losslessly. Artwork is never resampled and no background-removal tool is used.
`;

function fail(message: string): never {
  console.error(`error: ${message}`);
  console.error(USAGE);
  process.exit(2);
}

function positiveInt(value: string | undefined, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} must be a positive integer`);
  return parsed;
}

function parseArgs(argv: string[]): Options {
  const out: Options = { dryRun: false, force: false, printPrompt: false };
  const args = argv.filter((arg) => arg !== "--");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      const value = args[++i];
      if (!value || value.startsWith("--")) fail(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--input": out.input = next(); break;
      case "--output": out.output = next(); break;
      case "--layout": out.layout = next(); break;
      case "--columns": out.columns = positiveInt(next(), arg); break;
      case "--rows": out.rows = positiveInt(next(), arg); break;
      case "--tile-size": out.tileSize = positiveInt(next(), arg); break;
      case "--canvas-size": out.canvasSize = next(); break;
      case "--padding": out.padding = positiveInt(next(), arg); break;
      case "--extra": out.extra = next(); break;
      case "--dry-run": out.dryRun = true; break;
      case "--force": out.force = true; break;
      case "--print-prompt": out.printPrompt = true; break;
      case "--help":
      case "-h": console.log(USAGE); process.exit(0);
      default: fail(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function parseCanvas(value: string): { width: number; height: number; value: string } {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) fail(`invalid --canvas-size: ${value}`);
  return { width: Number(match[1]), height: Number(match[2]), value };
}

function chooseCanvas(width: number, height: number, requested?: string) {
  const supported = ["1024x1024", "1536x1024", "1024x1536"].map(parseCanvas);
  if (requested) {
    const canvas = parseCanvas(requested);
    if (!supported.some((item) => item.value === canvas.value))
      fail(`gpt-image-1.5 native-alpha output does not support ${requested}`);
    if (canvas.width < width || canvas.height < height)
      fail(`${requested} cannot contain the ${width}x${height} usable atlas region`);
    return canvas;
  }
  const canvas = supported
    .filter((item) => item.width >= width && item.height >= height)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (!canvas)
    fail(`the ${width}x${height} usable atlas exceeds every native-alpha model size`);
  return canvas;
}

function readLayout(path: string | undefined): Layout {
  if (!path) return {};
  const absolute = resolve(path);
  if (!existsSync(absolute)) fail(`layout does not exist: ${path}`);
  try {
    return JSON.parse(readFileSync(absolute, "utf8")) as Layout;
  } catch (error) {
    fail(`could not parse layout ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

function makePrompt(args: {
  columns: number;
  rows: number;
  tileSize: number;
  padding: number;
  canvasWidth: number;
  canvasHeight: number;
  sprites: LayoutSprite[];
  extra?: string;
}): string {
  const { columns, rows, tileSize, padding, canvasWidth, canvasHeight, sprites, extra } = args;
  const atlasWidth = columns * tileSize;
  const atlasHeight = rows * tileSize;
  const placements = sprites.length
    ? sprites
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .map((sprite) => `- row ${sprite.row}, column ${sprite.col}: ${sprite.name}`)
        .join("\n")
    : "- Preserve every item in the same row and column as Image 1.";

  return `Use case: background-extraction
Asset type: production sprite atlas for a game
Input images: Image 1 is the designer/reference atlas and the only design authority.

Primary request:
Re-render Image 1 as finished production artwork. Preserve the same sprites, poses,
silhouettes, proportions, internal details, palette, rendering style, facing directions,
row/column order, and relative visual scale. This is a faithful cleanup pass, not a
redesign and not a request for variants.

Canvas and atlas geometry:
- Output canvas: exactly ${canvasWidth}x${canvasHeight} pixels.
- Usable atlas region: exactly ${atlasWidth}x${atlasHeight} pixels, beginning at x=0, y=0.
- Grid: exactly ${columns} columns by ${rows} rows.
- Every cell: exactly ${tileSize}x${tileSize} pixels.
- Keep at least ${padding} transparent pixels between each sprite silhouette and its cell edge.
- Keep each sprite completely inside its own cell. Nothing may cross a cell boundary.
- Preserve the reference sprite's footprint and anchor within its cell, scaled to this final cell size.
- Do not draw grid lines, guides, labels, captions, borders, or registration marks.
- If the output canvas extends beyond the usable atlas region, every pixel to the right
  or below that region must remain fully transparent and empty.

Required placements (zero-based row and column):
${placements}

Transparency and edges:
- Generate genuine transparent alpha directly; do not paint a white, black, colored,
  checkerboard, or photographic background.
- Re-render clean alpha edges as part of the artwork. Do not merely erase or cut out
  the old background, and do not retain background-colored fringe pixels.
- No cast shadows, contact shadows, glow outside cells, floor plane, reflections,
  ambient haze, loose particles, or stray pixels.
- RGB color at partially transparent edge pixels must belong to the sprite, preventing halos.

Invariants:
- Change only resolution/scale fitness, edge cleanliness, and transparency.
- Keep every design visibly the same as its counterpart in Image 1.
- Do not add, omit, merge, split, reorder, restyle, or reinterpret any sprite.
- No text and no watermark.${extra ? `\n- Additional constraint: ${extra}` : ""}`;
}

function validateOutput(args: {
  output: string;
  canvasWidth: number;
  canvasHeight: number;
  columns: number;
  rows: number;
  tileSize: number;
  padding: number;
}): void {
  const { output, canvasWidth, canvasHeight, columns, rows, tileSize, padding } = args;
  if (!existsSync(output)) fail(`model command succeeded but did not create ${output}`);
  const { rgba, w, h } = decodePng(readFileSync(output));
  if (w !== canvasWidth || h !== canvasHeight)
    fail(`generated PNG is ${w}x${h}; expected ${canvasWidth}x${canvasHeight}`);

  const alphaAt = (x: number, y: number) => rgba[(y * w + x) * 4 + 3];
  const atlasWidth = columns * tileSize;
  const atlasHeight = rows * tileSize;
  let outsidePixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x >= atlasWidth || y >= atlasHeight) && alphaAt(x, y) > 0) outsidePixels++;
    }
  }

  const emptyCells: string[] = [];
  const paddingViolations: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      let visiblePixels = 0;
      let touchesPadding = false;
      for (let y = y0; y < y0 + tileSize; y++) {
        for (let x = x0; x < x0 + tileSize; x++) {
          if (alphaAt(x, y) === 0) continue;
          visiblePixels++;
          if (
            x < x0 + padding || x >= x0 + tileSize - padding ||
            y < y0 + padding || y >= y0 + tileSize - padding
          ) touchesPadding = true;
        }
      }
      if (visiblePixels === 0) emptyCells.push(`(${row},${col})`);
      if (touchesPadding) paddingViolations.push(`(${row},${col})`);
    }
  }

  const problems: string[] = [];
  if (outsidePixels) problems.push(`${outsidePixels} visible pixels outside the usable atlas region`);
  if (emptyCells.length) problems.push(`empty cells: ${emptyCells.join(", ")}`);
  if (paddingViolations.length)
    problems.push(`artwork entered the ${padding}px safety inset in cells: ${paddingViolations.join(", ")}`);
  if (problems.length) {
    console.error(`generated file kept for inspection: ${output}`);
    fail(`atlas validation failed:\n- ${problems.join("\n- ")}`);
  }
  console.log(`validated: native-alpha geometry and ${columns * rows} populated cells`);
}

function cropTopLeft(input: string, output: string, width: number, height: number): void {
  const { rgba, w, h } = decodePng(readFileSync(input));
  if (width > w || height > h) fail(`cannot crop ${w}x${h} model output to ${width}x${height}`);
  const cropped = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = y * w * 4;
    cropped.set(rgba.subarray(start, start + width * 4), y * width * 4);
  }
  writeFileSync(output, encodePng(cropped, width, height));
}

function canvasPath(output: string): string {
  const extension = extname(output);
  const stem = basename(output, extension);
  return join(dirname(output), `${stem}.model-canvas${extension}`);
}

const options = parseArgs(process.argv.slice(2));
if (!options.input) fail("--input is required");
if (!options.output && !options.printPrompt) fail("--output is required");

const input = resolve(options.input);
if (!existsSync(input)) fail(`input does not exist: ${options.input}`);
const output = options.output ? resolve(options.output) : undefined;
if (output && existsSync(output) && !options.force) fail(`output already exists: ${options.output} (pass --force to replace it)`);
if (output && extname(output).toLowerCase() !== ".png") fail("--output must end in .png");

const layout = readLayout(options.layout);
const columns = options.columns ?? layout.columns;
const rows = options.rows ?? layout.rows;
const tileSize = options.tileSize ?? layout.tileSize;
if (!columns || !rows || !tileSize)
  fail("provide --layout or all of --columns, --rows, and --tile-size");

const atlasWidth = columns * tileSize;
const atlasHeight = rows * tileSize;
const canvas = chooseCanvas(atlasWidth, atlasHeight, options.canvasSize);
const needsCrop = canvas.width !== atlasWidth || canvas.height !== atlasHeight;
const modelOutput = output && needsCrop ? canvasPath(output) : output;
if (modelOutput && modelOutput !== output && existsSync(modelOutput) && !options.force)
  fail(`temporary model output already exists: ${modelOutput} (pass --force to replace it)`);
const padding = options.padding ?? Math.max(4, Math.round(tileSize / 16));
if (padding * 2 >= tileSize) fail("--padding must leave room for artwork inside a cell");

const prompt = makePrompt({
  columns,
  rows,
  tileSize,
  padding,
  canvasWidth: canvas.width,
  canvasHeight: canvas.height,
  sprites: layout.sprites ?? [],
  extra: options.extra,
});

if (options.printPrompt) {
  console.log(prompt);
  process.exit(0);
}

const codexHome = process.env.CODEX_HOME ?? resolve(homedir(), ".codex");
const imageCli = resolve(codexHome, "skills/.system/imagegen/scripts/image_gen.py");
if (!existsSync(imageCli)) fail(`bundled image CLI not found: ${imageCli}`);
const projectPython = resolve(".venv/bin/python3");
const python = process.env.PYTHON ??
  (existsSync(projectPython) ? projectPython : undefined) ??
  Bun.which("python3") ??
  Bun.which("python");
if (!python) fail("python3 is required to run the bundled image CLI");

const command = [
  python,
  imageCli,
  "edit",
  "--model", "gpt-image-1.5",
  "--image", input,
  "--prompt", prompt,
  "--size", canvas.value,
  "--quality", "high",
  "--input-fidelity", "high",
  "--background", "transparent",
  "--output-format", "png",
  "--no-augment",
  "--out", modelOutput!,
];
if (options.dryRun) command.push("--dry-run");
if (options.force) command.push("--force");

console.log(`reference: ${input}`);
console.log(`usable atlas: ${atlasWidth}x${atlasHeight} (${columns}x${rows} cells at ${tileSize}px)`);
console.log(`model canvas: ${canvas.value}`);
console.log(`output: ${output}`);

const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
const status = await child.exited;
if (status !== 0) process.exit(status);
if (!options.dryRun) {
  validateOutput({
    output: modelOutput!,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    columns,
    rows,
    tileSize,
    padding,
  });
  if (needsCrop) {
    cropTopLeft(modelOutput!, output!, atlasWidth, atlasHeight);
    unlinkSync(modelOutput!);
    console.log(`cropped verified transparent canvas margin without resampling: ${atlasWidth}x${atlasHeight}`);
  }
}
