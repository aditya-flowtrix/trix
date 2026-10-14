/**
 * Shared helpers for the measuring scripts: a browser, a static server for
 * code exports, and argument parsing. Measurements always come from a real
 * browser's computed styles — never from reading CSS by name.
 */

import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright-core";

/** Viewports every measurement is taken at. 320 and 1440 are the Trix fluid range. */
export const WIDTHS = [320, 375, 768, 992, 1280, 1440, 1920];

export async function launch(): Promise<Browser> {
  for (const options of [{ channel: "chrome" }, { channel: "msedge" }, {}]) {
    try {
      return await chromium.launch(options);
    } catch {}
  }
  throw new Error(
    "No browser available. Install Google Chrome, or run `npx playwright install chromium`.",
  );
}

/** Loads a page and waits for fonts, lazy content and entrance animations to settle. */
export async function open(
  page: Page,
  url: string,
  width = 1440,
): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo(0, 0);
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);
}

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

/** Serves a code export (Webflow, Framer static, any HTML folder) on a free local port. */
export async function serve(
  dir: string,
): Promise<{ origin: string; server: Server }> {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    let path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (path.endsWith("/")) path += "index.html";
    let file = join(root, path);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file += ".html";
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { origin: `http://127.0.0.1:${port}`, server };
}

export function args(): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next && !next.startsWith("--") ? argv[++i] : true;
  }
  return out;
}

/** Writes into `.trix/` (git-ignored) and returns the path. */
export function output(name: string, content: string): string {
  mkdirSync(".trix", { recursive: true });
  const path = join(".trix", name);
  writeFileSync(path, content);
  return path;
}

export async function pool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}
