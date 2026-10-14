#!/usr/bin/env node
/**
 * Cross-browser test of the built site. Every page (crawled from `/`) at
 * phone, tablet and desktop widths: no script errors or failed requests, no
 * sideways scroll, unique ids, sized images, WCAG 2.2 AA (axe). Then every
 * component the page uses, driven by mouse and keyboard: nav, skip link,
 * accordion, dropdown, tabs, modal, slider, marquee, video, reveal, the
 * 12-column grid and Spacer.
 *
 * Usage
 *   npm run build && npm run test:browsers        every browser on this machine
 *   node tests/browsers.ts --dir dist --browser firefox,brave
 *   options: --widths 375,768,1440   --pages /,/about
 *
 * Browsers: chrome, chromium, edge, brave (Playwright: Chromium-based, each
 * at its own install), firefox, webkit (Playwright's builds; WebKit is
 * Safari's engine), and safari — the real one, through macOS's safaridriver,
 * once Safari → Settings → Developer → "Allow remote automation" is on.
 * A browser that is not installed is skipped and said so; one asked for by
 * name must be there.
 *
 * Writes .trix/browsers.md. Exit code 1 on any failure.
 */

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type Page as PwPage,
} from "playwright-core";
import { args, output, serve } from "../scripts/measure/browser.ts";

const opts = args();
const dir = typeof opts.dir === "string" ? opts.dir : "dist";
const widths =
  typeof opts.widths === "string"
    ? opts.widths.split(",").map(Number)
    : [375, 768, 1440];
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

/* ---------------- one page API over Playwright and WebDriver ---------------- */

interface Page {
  goto(url: string, width: number): Promise<void>;
  evaluate<T>(fn: string): Promise<T>;
  click(selector: string): Promise<void>;
  press(key: string): Promise<void>;
  /** Script errors and failed same-origin requests since the last goto. */
  errors(): string[];
  close(): Promise<void>;
}
interface Driver {
  name: string;
  /** Safari's Tab skips links unless Option is held. */
  tabKey: "Tab" | "Alt+Tab";
  page(): Promise<Page>;
  close(): Promise<void>;
}

const exists = (paths: string[]) => paths.find((p) => existsSync(p));
const brave = exists([
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/brave-browser",
  "/usr/bin/brave",
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
]);

async function playwright(name: string): Promise<Driver | string> {
  const launchers: Record<string, () => Promise<Browser>> = {
    chrome: () => chromium.launch({ channel: "chrome" }),
    chromium: () => chromium.launch(),
    edge: () => chromium.launch({ channel: "msedge" }),
    brave: () =>
      brave
        ? chromium.launch({ executablePath: brave })
        : Promise.reject(new Error("Brave is not installed")),
    firefox: () => firefox.launch(),
    webkit: () => webkit.launch(),
  };
  let browser: Browser;
  try {
    browser = await launchers[name]();
  } catch (e) {
    return String(e).split("\n")[0];
  }
  return {
    name,
    tabKey: name === "webkit" ? "Alt+Tab" : "Tab",
    close: () => browser.close(),
    async page() {
      let page: PwPage | undefined;
      let errors: string[] = [];
      const fresh = async (width: number) => {
        await page?.close();
        page = await browser.newPage({ viewport: { width, height: 900 } });
        page.on("pageerror", (e) => errors.push(`script error: ${e.message}`));
        page.on("console", (m) => {
          if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
            errors.push(`console: ${m.text()}`);
        });
        page.on("response", (r) => {
          const u = new URL(r.url());
          if (
            u.origin === origin &&
            r.status() >= 400 &&
            !/\/404$/.test(u.pathname)
          )
            errors.push(`${r.status()} ${u.pathname}`);
        });
      };
      return {
        async goto(url, width) {
          errors = [];
          await fresh(width);
          await page!.goto(url, { waitUntil: "load" });
        },
        evaluate: (fn) => page!.evaluate(`(${fn})()`),
        click: (selector) => page!.locator(selector).first().click(),
        press: (key) => page!.keyboard.press(key),
        errors: () => errors,
        close: async () => page?.close(),
      };
    },
  };
}

/** Real Safari over WebDriver: no dependency, just HTTP to safaridriver. */
async function safari(): Promise<Driver | string> {
  if (process.platform !== "darwin") return "Safari runs only on macOS";
  const port = 4457;
  const proc = spawn("safaridriver", ["-p", String(port)], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));
  const base = `http://127.0.0.1:${port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json()) as {
      value: Record<string, unknown> & { message?: string };
    };
    if (!r.ok) throw new Error(j.value?.message ?? `${r.status}`);
    return j.value;
  };
  let session: string;
  try {
    const v = await call("POST", "/session", {
      capabilities: { alwaysMatch: { browserName: "safari" } },
    });
    session = String(v.sessionId);
  } catch (e) {
    proc.kill();
    return String(e instanceof Error ? e.message : e);
  }
  const s = (path: string) => `/session/${session}${path}`;
  const KEYS: Record<string, string[]> = {
    Tab: ["\uE004"],
    "Alt+Tab": ["\uE00A", "\uE004"],
    Enter: ["\uE007"],
    Escape: ["\uE00C"],
    ArrowRight: ["\uE014"],
    "Shift+G": ["\uE008", "G"],
  };
  return {
    name: "safari",
    tabKey: "Alt+Tab",
    close: async () => {
      await call("DELETE", s("")).catch(() => {});
      proc.kill();
    },
    async page() {
      return {
        async goto(url, width) {
          await call("POST", s("/window/rect"), { width, height: 900 });
          await call("POST", s("/url"), { url });
        },
        async evaluate(fn) {
          const v = await call("POST", s("/execute/async"), {
            script: `const done = arguments[arguments.length - 1];
              Promise.resolve((${fn})()).then((v) => done({ v }), (e) => done({ e: String(e) }));`,
            args: [],
          });
          if ("e" in v) throw new Error(String(v.e));
          return v.v as never;
        },
        async click(selector) {
          const el = await call("POST", s("/element"), {
            using: "css selector",
            value: selector,
          });
          const id = Object.values(el)[0];
          await call("POST", s(`/element/${id}/click`), {});
        },
        async press(key) {
          const keys = KEYS[key];
          await call("POST", s("/actions"), {
            actions: [
              {
                type: "key",
                id: "keyboard",
                actions: [
                  ...keys.map((value) => ({ type: "keyDown", value })),
                  ...[...keys]
                    .reverse()
                    .map((value) => ({ type: "keyUp", value })),
                ],
              },
            ],
          });
          await call("DELETE", s("/actions")).catch(() => {});
        },
        // WebDriver cannot listen to the console; layout and axe still run.
        errors: () => [],
        close: async () => {},
      };
    },
  };
}

/* ---------------- what is checked ---------------- */

type Result = {
  browser: string;
  where: string;
  check: string;
  ok: boolean;
  detail: string;
};
const results: Result[] = [];
let current = "";
const check = (where: string, name: string, ok: boolean, detail = "") => {
  results.push({ browser: current, where, check: name, ok, detail });
  if (!ok)
    console.log(`  FAIL ${where} — ${name}${detail ? `: ${detail}` : ""}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGE_FACTS = `async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 30));
  }
  scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
  // Reveals still fading in read as low contrast; wait for every finite one.
  await Promise.all(document.getAnimations()
    .filter((a) => Number.isFinite(a.effect?.getTiming().iterations ?? 1))
    .map((a) => a.finished.catch(() => {})));
  const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dup: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
    unsized: [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("width") || !i.getAttribute("height")).length,
    // Visible text squeezed to nothing: clipped, so no other check sees it.
    collapsed: [...document.querySelectorAll("table, .rich-text, .heading, .text")]
      .filter((e) => e.checkVisibility() && e.textContent.trim() && e.getBoundingClientRect().width < 1)
      .map((e) => e.tagName.toLowerCase() + "." + [...e.classList].join(".")),
    shownHidden: [...document.querySelectorAll('[hidden]:not([hidden="until-found"])')]
      .filter((e) => e.checkVisibility())
      .map((e) => e.tagName.toLowerCase() + "." + [...e.classList].join(".")),
    links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
    has: Object.fromEntries(Object.entries({
      nav: ".nav_toggle", accordion: "details.accordion_item", dropdown: "details.dropdown_wrap",
      tabs: '[role="tablist"] [role="tab"]', modal: "[data-modal-open]", slider: '.slider_controls button[data-step="1"]',
      marquee: "[data-marquee-toggle]", video: "[data-video-toggle]", reveal: "[data-animate]",
      row: ".row", spacer: ".container > .spacer", overlay: ".grid-overlay",
    }).map(([k, sel]) => [k, !!document.querySelector(sel)])),
  };
}`;
const AXE = `async () => {
  if (!window.axe) { const s = document.createElement("script"); s.textContent = ${JSON.stringify(axeSource)}; document.head.append(s); }
  const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
  return r.violations.map((v) => v.id + " (" + v.impact + ", " + v.nodes.length + "): " + v.nodes[0].target.join(" "));
}`;
// Every column of every Row starts and ends on a line of the 12-column grid.
const GRID = `() => {
  const off = [];
  for (const row of document.querySelectorAll(".row")) {
    const r = row.getBoundingClientRect();
    const g = parseFloat(getComputedStyle(row).columnGap) || 0;
    const unit = (r.width - 11 * g) / 12 + g;
    for (const col of row.children) {
      const b = col.getBoundingClientRect();
      const start = (b.left - r.left) / unit;
      const span = (b.width + g) / unit;
      if (Math.abs(start - Math.round(start)) > 0.02 || Math.abs(span - Math.round(span)) > 0.02)
        off.push(col.className + " start " + start.toFixed(2) + " span " + span.toFixed(2));
    }
  }
  return off;
}`;
// The blocks either side of a Spacer in a Section are exactly its size apart.
const SPACER = `() => [...document.querySelectorAll(".container > .spacer")].flatMap((s) => {
  const a = s.previousElementSibling, b = s.nextElementSibling;
  if (!a || !b) return [];
  const gap = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom;
  const size = s.getBoundingClientRect().height;
  return Math.abs(gap - size) > 0.5 ? [gap.toFixed(1) + " apart, size " + size.toFixed(1)] : [];
})`;

let origin = "";

async function testPage(driver: Driver, page: Page, path: string) {
  const url = origin + path;
  let facts = { has: {} as Record<string, boolean>, links: [] as string[] };
  for (const w of widths) {
    const where = `${path} @${w}`;
    await page.goto(url, w);
    const f = await page.evaluate<{
      overflow: number;
      dup: string[];
      unsized: number;
      collapsed: string[];
      shownHidden: string[];
      links: string[];
      has: Record<string, boolean>;
    }>(PAGE_FACTS);
    facts = f;
    check(
      where,
      "no script errors or failed requests",
      page.errors().length === 0,
      page.errors().slice(0, 3).join(" | "),
    );
    check(where, "no sideways scroll", f.overflow <= 0, `${f.overflow}px`);
    check(where, "unique ids", f.dup.length === 0, f.dup.join(", "));
    check(
      where,
      "images have width and height",
      f.unsized === 0,
      `${f.unsized}`,
    );
    check(
      where,
      "text and tables have width",
      f.collapsed.length === 0,
      f.collapsed.slice(0, 3).join(", "),
    );
    check(
      where,
      "hidden elements stay hidden",
      f.shownHidden.length === 0,
      f.shownHidden.slice(0, 3).join(", "),
    );
    const axe = await page.evaluate<string[]>(AXE);
    check(where, "WCAG 2.2 AA (axe)", axe.length === 0, axe.join(" || "));
    if (f.has.row) {
      const off = await page.evaluate<string[]>(GRID);
      check(
        where,
        "columns on the 12-column grid",
        off.length === 0,
        off.slice(0, 3).join("; "),
      );
    }
    if (f.has.spacer) {
      const off = await page.evaluate<string[]>(SPACER);
      check(
        where,
        "Spacer: neighbours exactly its size apart",
        off.length === 0,
        off.join("; "),
      );
    }
    if (f.has.nav && w < 768) {
      await page.click(".nav_toggle");
      await wait(400);
      check(
        where,
        "mobile menu opens",
        await page.evaluate(
          `() => document.querySelector(".nav_toggle").getAttribute("aria-expanded") === "true" && document.getElementById("nav-menu").checkVisibility()`,
        ),
      );
      await page.press("Escape");
      await wait(400);
      check(
        where,
        "Escape closes the menu",
        await page.evaluate(
          `() => document.querySelector(".nav_toggle").getAttribute("aria-expanded") === "false"`,
        ),
      );
    }
  }

  // Interactions at desktop width
  const has = facts.has;
  const where = `${path} interactions`;
  const fresh = () => page.goto(url, 1440);
  if (path === "/") {
    await fresh();
    await page.press(driver.tabKey);
    check(
      where,
      "first Tab reaches the skip link",
      await page.evaluate(
        `() => document.activeElement?.classList.contains("skip-link")`,
      ),
    );
    await page.press("Enter");
    await wait(300);
    check(
      where,
      "skip link moves focus to main",
      await page.evaluate(`() => !!document.activeElement?.closest("main")`),
    );
  }
  if (has.accordion) {
    await fresh();
    const result = await page.evaluate<boolean>(`async () => {
      const item = document.querySelector("details.accordion_item:not([open])") ?? document.querySelector("details.accordion_item");
      const was = item.open;
      item.querySelector("summary").click();
      await new Promise((r) => setTimeout(r, 400));
      return item.open !== was;
    }`);
    check(where, "accordion toggles", result);
  }
  if (has.dropdown) {
    await fresh();
    await page.click("details.dropdown_wrap summary");
    await wait(300);
    check(
      where,
      "dropdown opens",
      await page.evaluate(
        `() => document.querySelector("details.dropdown_wrap").open`,
      ),
    );
  }
  if (has.tabs) {
    await fresh();
    await page.click('[role="tablist"] [role="tab"]:nth-child(2)');
    await wait(300);
    check(
      where,
      "tabs: a click selects the tab and shows its panel",
      await page.evaluate(`() => {
      const tabs = [...document.querySelector('[role="tablist"]').querySelectorAll('[role="tab"]')];
      const t = tabs[1];
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      return t.getAttribute("aria-selected") === "true" && tabs.filter((x) => x.getAttribute("aria-selected") === "true").length === 1 && panel && !panel.hidden && panel.checkVisibility();
    }`),
    );
    await page.evaluate(
      `() => document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]').focus()`,
    );
    await page.press("ArrowRight");
    await wait(200);
    check(
      where,
      "tabs: arrow key moves focus to the next tab",
      await page.evaluate(`() => {
      const tabs = [...document.querySelector('[role="tablist"]').querySelectorAll('[role="tab"]')];
      return tabs.indexOf(document.activeElement) === 2;
    }`),
    );
  }
  if (has.modal) {
    await fresh();
    await page.click("[data-modal-open]");
    await wait(400);
    check(
      where,
      "modal opens",
      await page.evaluate(
        `() => document.getElementById(document.querySelector("[data-modal-open]").dataset.modalOpen)?.open === true`,
      ),
    );
    await page.press("Escape");
    await wait(400);
    check(
      where,
      "modal closes on Escape and returns focus",
      await page.evaluate(`() => {
      const opener = document.querySelector("[data-modal-open]");
      return !document.getElementById(opener.dataset.modalOpen).open && document.activeElement === opener;
    }`),
    );
  }
  if (has.slider) {
    await fresh();
    const before = await page.evaluate<number>(
      `() => document.querySelector(".slider_list").scrollLeft`,
    );
    await page.click('.slider_controls button[data-step="1"]');
    await wait(900);
    const after = await page.evaluate<number>(
      `() => document.querySelector(".slider_list").scrollLeft`,
    );
    check(
      where,
      "slider: next moves the slides",
      after > before,
      `${before} → ${after}`,
    );
  }
  for (const [kind, selector] of [
    ["marquee", "[data-marquee-toggle]"],
    ["video", "[data-video-toggle]"],
  ] as const) {
    if (!has[kind]) continue;
    await fresh();
    await page.evaluate(
      `() => document.querySelector('${selector}').scrollIntoView({ block: "center" })`,
    );
    await wait(300);
    const was = await page.evaluate<string>(
      `() => document.querySelector('${selector}').getAttribute("aria-pressed")`,
    );
    await page.click(selector);
    await wait(200);
    const now = await page.evaluate<string>(
      `() => document.querySelector('${selector}').getAttribute("aria-pressed")`,
    );
    check(
      where,
      `${kind}: pause button toggles`,
      was !== now,
      `${was} → ${now}`,
    );
  }
  if (has.reveal) {
    await fresh();
    const shown = await page.evaluate<boolean>(`async () => {
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      for (const el of document.querySelectorAll("[data-animate]")) {
        el.scrollIntoView({ block: "center" });
        await new Promise((r) => setTimeout(r, 200));
      }
      await new Promise((r) => setTimeout(r, 1800));
      return reduced || [...document.querySelectorAll("[data-animate] > *")].every((c) => getComputedStyle(c).opacity === "1");
    }`);
    check(where, "reveal: everything visible after scrolling in", shown);
  }
  if (has.overlay) {
    await fresh();
    await page.press("Shift+G");
    await wait(200);
    check(
      where,
      "Shift+G shows the grid overlay",
      await page.evaluate(
        `() => !document.querySelector(".grid-overlay").hidden`,
      ),
    );
  }
  return facts.links;
}

/* ---------------- run ---------------- */

const all = [
  "chrome",
  "chromium",
  "edge",
  "brave",
  "firefox",
  "webkit",
  "safari",
];
const asked =
  typeof opts.browser === "string" ? opts.browser.split(",") : undefined;
const s = await serve(dir);
origin = s.origin;
const skipped: string[] = [];

for (const name of asked ?? all) {
  const driver = name === "safari" ? await safari() : await playwright(name);
  if (typeof driver === "string") {
    skipped.push(`${name}: ${driver}`);
    if (asked) check(name, "browser available", false, driver);
    continue;
  }
  current = name;
  console.log(`${name}`);
  const page = await driver.page();
  const queue =
    typeof opts.pages === "string" ? opts.pages.split(",") : ["/", "/404"];
  const seen = new Set<string>();
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const links = await testPage(driver, page, path).catch((e) => {
      check(path, "page could be tested", false, String(e).split("\n")[0]);
      return [] as string[];
    });
    if (typeof opts.pages !== "string")
      for (const href of links) {
        const u = new URL(href);
        if (u.origin === origin && !/\.[a-z0-9]+$/i.test(u.pathname))
          queue.push(u.pathname.replace(/(.)\/$/, "$1"));
      }
  }
  await page.close();
  await driver.close();
}
s.server.close();

const byBrowser = Object.groupBy(results, (r) => r.browser);
const summary = Object.entries(byBrowser).map(
  ([b, list]) => `${b}: ${list!.filter((r) => r.ok).length}/${list!.length}`,
);
output(
  "browsers.md",
  [
    "# Browser test",
    "",
    summary.map((x) => `- ${x}`).join("\n"),
    ...(skipped.length
      ? ["", "Not run:", ...skipped.map((x) => `- ${x}`)]
      : []),
    "",
    "| Browser | Where | Check | Result |",
    "| --- | --- | --- | --- |",
    ...results.map(
      (r) =>
        `| ${r.browser} | \`${r.where}\` | ${r.check} | ${r.ok ? "ok" : `FAIL ${r.detail.replace(/\|/g, "\\|")}`} |`,
    ),
  ].join("\n"),
);
console.log(`\n${summary.join(" · ")}`);
if (skipped.length) console.log(`Not run — ${skipped.join("; ")}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
