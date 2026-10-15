#!/usr/bin/env node
/**
 * Checks a site's cookie consent in a real browser, the way a visitor and a
 * regulator meet it:
 *
 *   - before a choice nothing third-party loads, embeds stay empty, and with
 *     JavaScript off nothing loads either
 *   - Reject and Accept carry the same weight; nothing covers the banner, not
 *     even a widget at the top of the z-index scale, and it fits a phone
 *   - Reject holds across a reload; Accept loads every vendor
 *   - the settings panel opens from the footer and Escape returns focus;
 *     withdrawing consent reloads the page without the vendors
 *   - the banner and the panel pass axe (WCAG 2.2 AA)
 *
 * It builds the site first in offline mode, into a temporary folder, so no
 * check writes to the live consent record (legal evidence, never deleted)
 * and dist/ is left alone. Third-party requests are answered empty and never
 * sent, except --allow hosts, which load for real.
 *
 * Usage:
 *   node .agents/skills/trix-consent/verify.ts --vendor googletagmanager.com
 *     [--vendor …] [--allow host] [--page /] [--root .]
 *
 *   --vendor  part of a URL a gated vendor loads (repeat for each vendor)
 *   --allow   a host that may load before a choice: only an exception
 *             recorded in PROJECT.md → Consent
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Browser, Page } from "playwright-core";
import { launch, open, serve } from "../../../scripts/measure/browser.ts";

const { values } = parseArgs({
  options: {
    root: { type: "string", default: "." },
    page: { type: "string", default: "/" },
    vendor: { type: "string", multiple: true, default: [] },
    allow: { type: "string", multiple: true, default: [] },
  },
});
const root = resolve(values.root);
const vendors = values.vendor;
const allowed = new Set(values.allow);
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);
if (!vendors.length)
  console.log(
    "No --vendor given: only third-party requests before a choice are checked.\n",
  );

const out = mkdtempSync(join(tmpdir(), "trix-consent-verify-"));
execFileSync(
  process.execPath,
  [join(root, "node_modules/astro/bin/astro.mjs"), "build", "--outDir", out],
  {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, PUBLIC_CONSENT_OFFLINE: "1" },
  },
);
const { origin, server } = await serve(out);
const browser: Browser = await launch();
const url = new URL(values.page, origin).href;
const failures: string[] = [];
let passed = 0;

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(
      `FAIL  ${name}\n      ${String((error as Error).message).replaceAll("\n", "\n      ")}`,
    );
  }
}

/** A visitor with nothing stored. Every request is logged. */
async function visit(
  options: { javaScriptEnabled?: boolean; width?: number } = {},
) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    javaScriptEnabled: options.javaScriptEnabled ?? true,
    viewport: { width: options.width ?? 1280, height: 800 },
  });
  const requests: string[] = [];
  await context.route("**/*", (route) => {
    const href = route.request().url();
    requests.push(href);
    const { origin: from, host } = new URL(href);
    return from === origin || allowed.has(host)
      ? route.continue()
      : route.fulfill({ status: 200, body: "" });
  });
  const page = await context.newPage();
  // Without scripting, timers never fire for open()'s scroll, and browsers
  // load lazy content at once anyway.
  if (options.javaScriptEnabled === false) {
    await page.goto(url);
    await settle(page);
  } else await load(page, options.width);
  return { context, page, requests };
}

/**
 * Scrolled to the bottom and back, so lazy embeds and images load, then a
 * wait for widgets a timer injects.
 */
// ponytail: a widget injected later than 2 s goes unseen; raise LATE for one.
const LATE = 2_000;
async function load(page: Page, width = 1280) {
  await open(page, url, width);
  await page.waitForTimeout(LATE);
}

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
};
const until = async (test: () => boolean | Promise<boolean>, ms = 5000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await test()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
};
const bannerOpen = (page: Page) =>
  page.evaluate(
    () =>
      document
        .querySelector("[data-consent-banner]")
        ?.matches(":popover-open") ?? false,
  );
const vendorRequests = (requests: string[]) =>
  requests.filter((href) => vendors.some((vendor) => href.includes(vendor)));
const thirdParty = (requests: string[]) =>
  requests.filter((href) => {
    if (!/^https?:/.test(href)) return false;
    const { origin: from, host } = new URL(href);
    return from !== origin && !allowed.has(host);
  });
const filledEmbeds = (page: Page) =>
  page.$$eval(
    "iframe[data-category]",
    (frames) =>
      frames.filter((f) => {
        const src = f.getAttribute("src");
        return src && src !== "about:blank";
      }).length,
  );

/** Buttons on the banner whose centre is not the button itself. */
const coveredButtons = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-consent-banner] :is([data-consent-action], [data-consent-right]):not([hidden])",
      ),
    ]
      .filter((button) => {
        const r = button.getBoundingClientRect();
        return !button.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      })
      .map((button) => button.textContent?.trim()),
  );

async function axe(page: Page, selector: string) {
  const violations = await page.evaluate(
    async ({ source, selector }) => {
      const w = window as unknown as { axe?: { run: Function } };
      if (!w.axe) {
        const script = document.createElement("script");
        script.textContent = source;
        document.head.append(script);
      }
      const result = await w.axe!.run(selector, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      });
      return result.violations.map(
        (v: { id: string; nodes: unknown[] }) => `${v.id} (${v.nodes.length})`,
      );
    },
    { source: axeSource, selector },
  );
  assert.deepEqual(violations, [], `axe: ${violations.join(", ")}`);
}

try {
  const first = await visit();
  const banner = first.page.locator("[data-consent-banner]");
  const button = (action: string) =>
    banner.locator(`[data-consent-action="${action}"]`);

  await check(
    "Before a choice the banner shows, nothing third-party loads and embeds stay empty",
    async () => {
      await until(() => bannerOpen(first.page));
      assert.ok(await bannerOpen(first.page), "the banner never showed");
      await settle(first.page);
      const early = [
        ...new Set([
          ...thirdParty(first.requests),
          ...vendorRequests(first.requests),
        ]),
      ];
      assert.deepEqual(
        early,
        [],
        `loaded before a choice: ${early.join(", ")}`,
      );
      assert.equal(
        await filledEmbeds(first.page),
        0,
        "embeds filled before a choice",
      );
    },
  );

  await check("Reject all is as prominent as Accept all", async () => {
    const look = (action: string) =>
      button(action).evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          shown: r.width > 0,
          className: el.className,
          background: s.backgroundColor,
          color: s.color,
          font: `${s.fontSize} ${s.fontWeight}`,
          height: Math.round(r.height),
          width: r.width,
        };
      });
    const reject = await look("reject");
    const accept = await look("accept");
    assert.ok(reject.shown && accept.shown, "both buttons are shown");
    assert.deepEqual({ ...reject, width: 0 }, { ...accept, width: 0 });
    assert.ok(
      Math.min(reject.width, accept.width) /
        Math.max(reject.width, accept.width) >
        0.8,
      `widths ${reject.width} and ${accept.width}`,
    );
  });

  await check(
    "Nothing covers the banner's buttons, not even a widget at z-index 2147483647",
    async () => {
      assert.deepEqual(await coveredButtons(first.page), []);
      await first.page.evaluate(() => {
        const widget = document.createElement("div");
        widget.id = "trix-consent-widget";
        widget.style.cssText = "position:fixed;inset:0;z-index:2147483647";
        document.body.append(widget);
      });
      const covered = await coveredButtons(first.page);
      await first.page.evaluate(() =>
        document.querySelector("#trix-consent-widget")?.remove(),
      );
      assert.deepEqual(covered, [], "covered by the widget");
    },
  );

  await check("The banner passes axe (WCAG 2.2 AA)", () =>
    axe(first.page, "[data-consent-banner]"),
  );

  await check(
    "Reject all: nothing loads, and the choice holds after a reload",
    async () => {
      await button("reject").click();
      await until(async () => !(await bannerOpen(first.page)));
      await settle(first.page);
      await load(first.page);
      assert.equal(await bannerOpen(first.page), false, "the banner came back");
      const after = thirdParty(first.requests);
      assert.deepEqual(
        after,
        [],
        `loaded after Reject all: ${after.join(", ")}`,
      );
      assert.deepEqual(vendorRequests(first.requests), []);
      assert.equal(await filledEmbeds(first.page), 0);
    },
  );
  await first.context.close();

  await check(
    "On a phone (320px) the banner fits and every button is reachable",
    async () => {
      const phone = await visit({ width: 320 });
      await until(() => bannerOpen(phone.page));
      const box = await phone.page
        .locator("[data-consent-banner]")
        .boundingBox();
      assert.ok(
        box && box.x >= 0 && box.x + box.width <= 320,
        `banner at ${JSON.stringify(box)}`,
      );
      assert.deepEqual(await coveredButtons(phone.page), []);
      await phone.context.close();
    },
  );

  await check(
    "With JavaScript off nothing third-party loads and embeds stay empty",
    async () => {
      const noScript = await visit({ javaScriptEnabled: false });
      assert.deepEqual(thirdParty(noScript.requests), []);
      assert.deepEqual(vendorRequests(noScript.requests), []);
      assert.equal(await filledEmbeds(noScript.page), 0);
      await noScript.context.close();
    },
  );

  const second = await visit();
  const opener = second.page.locator("[data-consent-open] [data-modal-open]");
  const panel = second.page.locator("#consent-settings");

  await check(
    "Accept all: every vendor loads and gated embeds fill",
    async () => {
      await until(() => bannerOpen(second.page));
      await second.page
        .locator('[data-consent-banner] [data-consent-action="accept"]')
        .click();
      const embeds = await second.page.locator("iframe[data-category]").count();
      const missing = () =>
        vendors.filter(
          (v) => !second.requests.some((href) => href.includes(v)),
        );
      await until(
        async () =>
          !missing().length && (await filledEmbeds(second.page)) === embeds,
      );
      assert.deepEqual(missing(), [], "vendors that never loaded");
      assert.equal(
        await filledEmbeds(second.page),
        embeds,
        "embeds still empty",
      );
    },
  );

  await check(
    "The settings panel opens from the footer, passes axe, and Escape returns focus",
    async () => {
      await opener.click();
      await panel.waitFor({ state: "visible" });
      await axe(second.page, "#consent-settings");
      await second.page.keyboard.press("Escape");
      await panel.waitFor({ state: "hidden" });
      assert.ok(
        await opener.evaluate((el) => el === document.activeElement),
        "focus is back on Cookie settings",
      );
    },
  );

  if (vendors.length)
    await check(
      "Withdrawing consent reloads the page, and the vendors stay gone",
      async () => {
        await opener.click();
        await panel.waitFor({ state: "visible" });
        for (const row of await panel
          .locator("[data-consent-category]:not([hidden])")
          .all())
          if (await row.locator("input:checked:not(:disabled)").count())
            await row.locator(".form-choice").click();
        const reloaded = second.page.waitForEvent("load", { timeout: 10_000 });
        second.requests.length = 0;
        await panel.locator('[data-consent-action="save"]').click();
        await reloaded;
        await load(second.page);
        const after = thirdParty(second.requests);
        assert.deepEqual(
          after,
          [],
          `loaded after withdrawal: ${after.join(", ")}`,
        );
        assert.deepEqual(vendorRequests(second.requests), []);
        assert.equal(await filledEmbeds(second.page), 0);
      },
    );
  else console.log("skip  Withdrawing consent: no --vendor given");
  await second.context.close();
} finally {
  await browser.close();
  server.close();
  rmSync(out, { recursive: true, force: true });
}

console.log(
  failures.length
    ? `\n${failures.length} consent check(s) failed.`
    : `\n${passed} consent checks pass.`,
);
process.exitCode = failures.length ? 1 : 0;
