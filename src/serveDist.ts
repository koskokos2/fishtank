import { join, posix } from "node:path";

export const DEFAULT_PORT = 8421;

export type StaticServer = ReturnType<typeof Bun.serve>;

export function serveDist(dist: string, port = DEFAULT_PORT): StaticServer {
  return Bun.serve({
    port,
    async fetch(req) {
      const assetPath = resolveAssetPath(dist, new URL(req.url).pathname);
      if (!assetPath) {
        return new Response("Not found", { status: 404 });
      }

      const file = Bun.file(assetPath);
      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(file);
    },
  });
}

export function readPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return port;
}

function resolveAssetPath(dist: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const normalized = posix.normalize(relative);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("\0")
  ) {
    return undefined;
  }

  return join(dist, normalized);
}
