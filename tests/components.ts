#!/usr/bin/env node
/**
 * Components where /components never shows them, each one a bug once: tab
 * labels and field labels in any script, two Tabs on one page, a component
 * inside a Marquee, and Astro's ClientRouter swapping pages without
 * reloading them — then the whole site under the CSP that `CSP` in
 * src/consts.ts turns on.
 *
 * A scratch copy of the framework with the pages in tests/fixtures/pages,
 * ClientRouter in the layout and the color mode on its default, auto, built and driven in
 * Chrome; then rebuilt with the CSP on and ClientRouter out. Framework only:
 * projects don't get it.
 *
 * Usage: node tests/components.ts
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch, serve } from "../scripts/measure/browser.ts";
import { scratchProject } from "./scratch.ts";
import {
  compareBy,
  distance,
  meets,
  pageRange,
  valuesOf,
} from "../src/utils/filter.ts";

const root = resolve(import.meta.dirname, "..");
const tmp = mkdtempSync(join(tmpdir(), "trix-components-"));
const site = join(tmp, "site");
const failures: string[] = [];
let passed = 0;
const it = async (name: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(
      `FAIL  ${name}\n${String(error)
        .split("\n")
        .slice(0, 6)
        .map((line) => `      ${line}`)
        .join("\n")}`,
    );
  }
};

try {
  const edit = scratchProject(root, site);
  cpSync(join(root, "tests/fixtures/pages"), join(site, "src/pages/test"), {
    recursive: true,
  });
  edit(
    "src/layouts/BaseLayout.astro",
    'import Reveal from "@/components/utility/Reveal.astro";',
    'import Reveal from "@/components/utility/Reveal.astro";\nimport { ClientRouter } from "astro:transitions";',
  );
  edit(
    "src/layouts/BaseLayout.astro",
    "<BaseHead {...seo} />",
    "<BaseHead {...seo} />\n    <ClientRouter />",
  );
  execFileSync("npm", ["run", "build"], {
    cwd: site,
    stdio: ["ignore", "ignore", "inherit"],
  });

  const { origin, server } = await serve(join(site, "dist"));
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const selected = (block: number) =>
    page.evaluate(
      (n) =>
        [
          ...document
            .querySelectorAll(".tabs_wrap")
            [n].querySelectorAll(".tabs_link"),
        ].findIndex((link) => link.getAttribute("aria-selected") === "true"),
      block,
    );

  try {
    await it("tab labels in any script: the page opens at the top", async () => {
      await page.goto(`${origin}/test/tabs-scripts`);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => scrollY), 0);
    });
    await it("tab labels in any script: automatic rotation starts", () =>
      page.waitForFunction(
        () => {
          const tabs = document.querySelector(".tabs_wrap.auto");
          return (
            tabs?.classList.contains("running") &&
            !tabs.classList.contains("is-paused")
          );
        },
        null,
        { timeout: 2000 },
      ));
    await it("tab labels in any script: a deep link opens the tab it names", async () => {
      await page.goto(
        `${origin}/test/tabs-scripts?tab=${encodeURIComponent("料金")}`,
      );
      assert.equal(await selected(0), 1);
    });
    await it("a tab with no text is linked by its position", async () => {
      await page.goto(`${origin}/test/tabs-scripts?tab-3=2`);
      assert.equal(await selected(2), 1);
    });
    await it("two Tabs on one page keep their own place in the URL", async () => {
      await page.goto(`${origin}/test/tabs-two`);
      const blocks = page.locator(".tabs_wrap");
      await blocks.nth(0).locator(".tabs_link").nth(1).click();
      await blocks.nth(1).locator(".tabs_link").nth(2).click();
      await page.reload();
      assert.deepEqual([await selected(0), await selected(1)], [1, 2]);
    });
    await it("a component inside a Marquee binds once: its Video's button pauses it", async () => {
      await page.goto(`${origin}/test/marquee-video`);
      await page.waitForFunction(
        () => !document.querySelector("video")?.paused,
        null,
        { timeout: 5000 },
      );
      // The strip never stops moving, so click it where it is.
      await page
        .locator("[data-video-toggle]")
        .first()
        .evaluate((button: HTMLButtonElement) => button.click());
      await page.waitForTimeout(300);
      assert.equal(
        await page
          .locator("video")
          .first()
          .evaluate((video: HTMLVideoElement) => video.paused),
        true,
      );
    });

    await it("a Marquee of text alone moves", async () => {
      await page.goto(`${origin}/test/marquee-text`);
      const offset = () =>
        page
          .locator(".marquee_track")
          .evaluate((track) => track.getBoundingClientRect().x);
      const before = await offset();
      await page.waitForTimeout(300);
      assert.notEqual(await offset(), before);
    });

    await it("form fields in any script keep their names, and ids of their own", async () => {
      await page.goto(`${origin}/test/form-scripts`);
      const form = await page.evaluate(() => ({
        names: [...new FormData(document.querySelector("form")!).keys()],
        ids: [...document.querySelectorAll("input")].map((input) => input.id),
      }));
      assert.deepEqual(form.names, ["お名前", "予算", "人数"]);
      assert.equal(new Set(form.ids).size, form.ids.length, form.ids.join(" "));
    });

    await it("a project's own mount on a component's selector runs beside the component's", async () => {
      await page.goto(`${origin}/test/mount-shared`);
      assert.deepEqual(
        await page
          .locator(".tabs_wrap")
          .evaluate((tabs) => [
            tabs.classList.contains("is-ready"),
            tabs.hasAttribute("data-also"),
          ]),
        [true, true],
      );
    });

    await it("Filter rules: operators, typos, sorting and page numbers", async () => {
      const item = {
        fields: { tags: ["oak", "black"], price: 120, date: "2024-01-10" },
        text: "Alpha chair",
      };
      const c = (op: string, values: string[], fields = ["tags"]) =>
        meets(item, {
          key: "k",
          fields,
          op: op as "equal",
          values,
          match: "any",
        });
      assert.ok(c("equal", ["Oak"]) && !c("not-equal", ["oak"]));
      assert.ok(c("contain", ["bla"]) && c("not-contain", ["wool"]));
      assert.ok(c("exist", []) && !c("exist", [], ["video"]));
      assert.ok(
        c("greater-equal", ["120"], ["price"]) &&
          !c("greater", ["120"], ["price"]),
      );
      assert.ok(
        c("less", ["2024-02-01"], ["date"]) &&
          !c("less", ["2024-01-01"], ["date"]),
      );
      assert.ok(
        meets(item, {
          key: "s",
          fields: [],
          op: "contain",
          values: ["chaer alpha"],
          match: "any",
          fuzzy: true,
        }),
      );
      assert.ok(
        !meets(item, {
          key: "s",
          fields: [],
          op: "contain",
          values: ["chaer"],
          match: "any",
        }),
      );
      assert.equal(distance("chair", "chaer", 1), 1);
      assert.deepEqual(valuesOf([1, "", null as never]), [1]);
      assert.deepEqual(valuesOf(false), []);
      const rows = ["Item 10", "Item 2", undefined].map((title) => ({
        fields: { title },
        text: "",
      }));
      assert.deepEqual(
        rows.sort(compareBy("title", "asc")).map((r) => r.fields.title),
        ["Item 2", "Item 10", undefined],
      );
      assert.deepEqual(pageRange(1, 4), [1, 2, 3, 4]);
      assert.deepEqual(pageRange(6, 12), [1, "…", 5, 6, 7, "…", 12]);
      assert.deepEqual(pageRange(1, 12, 0, 2), [1, 2, "…", 11, 12]);
    });

    const filter = page.locator(".filter_wrap").first();
    const shown = () =>
      filter.evaluate((wrap) =>
        [...wrap.querySelectorAll<HTMLElement>("[data-filter-item]")]
          .filter((item) => !item.hidden)
          .map((item) => item.querySelector("h3")?.textContent),
      );
    const count = () => filter.locator(".filter_count").textContent();
    // The label, not its input: the input is hidden under the label's mark.
    const choice = (value: string) =>
      filter
        .locator(".form-choice")
        .filter({ has: page.locator(`input[value="${value}"]`) });

    await it("Filter: before its script, only the first page is on show", async () => {
      const html = await (await fetch(`${origin}/test/filter`)).text();
      assert.equal(
        html.match(/data-filter-later data-filter-item/g)?.length,
        // Past each filter's first page: 10 items in 3s, 5 in 2s, 5 in 2s.
        7 + 3 + 3,
      );
    });
    await it("Filter: pages, numbered, and previous and next stop at the ends", async () => {
      await page.goto(`${origin}/test/filter`);
      assert.equal(await count(), "Showing 1–3 of 10");
      assert.deepEqual(await shown(), [
        "Alpha chair",
        "Beta lamp",
        "Gamma desk",
      ]);
      assert.ok(await filter.locator('[data-filter-step="-1"]').isDisabled());
      await filter.locator('[data-filter-step="1"]').click();
      assert.equal(await count(), "Showing 4–6 of 10");
      assert.match(page.url(), /[?&]page=2/);
      await filter.locator('.filter_page[data-page="4"]').click();
      assert.equal(await count(), "Showing 10–10 of 10");
      assert.ok(await filter.locator('[data-filter-step="1"]').isDisabled());
      assert.equal(
        await filter.locator(".filter_page[aria-current]").textContent(),
        "4",
      );
    });
    await it("Filter: a checkbox filters, counts what each option leaves, hides one that leaves none", async () => {
      await page.goto(`${origin}/test/filter`);
      await choice("furniture").click();
      assert.equal(await count(), "Showing 1–3 of 5");
      assert.match(page.url(), /\?category=furniture$/);
      // Counts come a moment after the results, between other work.
      const counts = () =>
        filter.locator("[data-filter-count]").allTextContents();
      for (let i = 0; i < 40 && (await counts()).join() !== "5,2,2,1,0"; i++)
        await page.waitForTimeout(25);
      assert.deepEqual(await counts(), ["5", "2", "2", "1", "0"]);
      assert.ok(await choice("outdoor").isHidden());
      assert.deepEqual(await filter.locator(".filter_tag").allTextContents(), [
        "Category: furniture",
      ]);
    });
    await it("Filter: search forgives a typo, and marks what it found", async () => {
      await page.goto(`${origin}/test/filter`);
      await filter.getByRole("searchbox").fill("chaer");
      await page.waitForTimeout(400);
      assert.deepEqual(await shown(), ["Alpha chair"]);
      await filter.getByRole("searchbox").fill("lamp");
      await page.waitForTimeout(400);
      assert.equal(
        await page.evaluate(() => CSS.highlights.get("filter-match")?.size),
        1,
      );
    });
    await it("Filter: ranges, sorting, a radio and a toggle; a tag removes its own choice", async () => {
      await page.goto(`${origin}/test/filter`);
      await filter.getByLabel("From", { exact: true }).first().fill("100");
      await filter.getByLabel("To", { exact: true }).first().fill("300");
      await filter.getByLabel("Sort by").selectOption("price-asc");
      await page.waitForTimeout(400);
      assert.deepEqual(await shown(), [
        "Alpha chair",
        "Zeta pendant",
        "Kappa mirror",
      ]);
      assert.deepEqual(await filter.locator(".filter_tag").allTextContents(), [
        "Price ≥ 100",
        "Price ≤ 300",
      ]);
      await filter.locator(".filter_tag").first().click();
      assert.equal(await count(), "Showing 1–3 of 8");
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        "Price ≤ 300",
      );
      await choice("black").click();
      await choice("true").click();
      assert.deepEqual(await shown(), ["Alpha chair"]);
      await filter.locator(".filter_clear").click();
      assert.equal(await count(), "Showing 1–3 of 10");
      assert.match(page.url(), /\?sort=price-asc$/, "clear all keeps the sort");
    });
    await it("Filter: a link with the choice in it opens filtered and sorted", async () => {
      await page.goto(
        `${origin}/test/filter?category=lighting&sort=price-desc`,
      );
      assert.deepEqual(await shown(), ["Zeta pendant", "Beta lamp"]);
      assert.ok(
        await filter.getByRole("checkbox", { name: /^lighting/ }).isChecked(),
      );
    });
    await it("Filter: one with an id keeps its own keys, waits for Apply, and loads more", async () => {
      await page.goto(`${origin}/test/filter`);
      const notes = page.locator("#notes");
      await notes.getByLabel("Category").selectOption("a");
      assert.equal(
        await notes.locator(".filter_count").textContent(),
        "Showing 2 of 5",
      );
      await notes.getByRole("button", { name: "Apply" }).click();
      assert.equal(
        await notes.locator(".filter_count").textContent(),
        "Showing 2 of 3",
      );
      assert.match(page.url(), /\?notes-category=a$/);
      await notes.getByRole("button", { name: "Load more" }).click();
      assert.equal(
        await notes.locator(".filter_count").textContent(),
        "Showing 3 of 3",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent?.trim()),
        "Four",
      );
      assert.ok(await notes.locator(".filter_paging").isHidden());
      await notes.getByRole("searchbox").fill("zzz");
      await notes.getByRole("button", { name: "Apply" }).click();
      assert.equal(
        await notes.locator('[role="status"]').textContent(),
        "No notes.",
      );
    });
    await it("Filter: infinite loads the next page as its end comes near", async () => {
      await page.goto(`${origin}/test/filter`);
      const feed = page.locator("#feed");
      assert.equal(
        await feed.locator(".filter_count").textContent(),
        "Showing 2 of 5",
      );
      await feed.locator(".filter_paging").scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () =>
          document.querySelector("#feed .filter_count")?.textContent ===
          "Showing 4 of 5",
      );
      // Kept, so a reload comes back with the same items and the same scroll.
      assert.match(page.url(), /feed-page=2/);
    });

    // /components → /style-guide → /components, swapped in place.
    await page.goto(`${origin}/components`);
    // A swap keeps the window; a reload would start a new one.
    await page.evaluate(() => Reflect.set(window, "unswapped", true));
    await page.locator('.footer_link[href="/style-guide"]').click();
    await page.waitForURL("**/style-guide");
    await page.locator('.footer_link[href="/components"]').click();
    await page.waitForURL("**/components");
    await page.waitForTimeout(500);

    await it("ClientRouter: the pages swap without a reload", async () =>
      assert.equal(
        await page.evaluate(() => Reflect.get(window, "unswapped")),
        true,
      ));
    await it("ClientRouter: Tabs select on click, one step per arrow key", async () => {
      const tabs = page.locator(".tabs_wrap").first();
      await tabs.scrollIntoViewIfNeeded();
      await tabs.locator(".tabs_link").nth(0).click();
      await page.keyboard.press("ArrowRight");
      assert.equal(await selected(0), 1);
    });
    await it("ClientRouter: Slider steps", async () => {
      const slider = page.locator(".slider_wrap").first();
      await slider.scrollIntoViewIfNeeded();
      const list = slider.locator(".slider_list");
      const before = await list.evaluate((l) => l.scrollLeft);
      await slider.locator('[data-step="1"]').first().click({ timeout: 2000 });
      await page.waitForTimeout(800);
      assert.ok((await list.evaluate((l) => l.scrollLeft)) > before);
    });
    await it("ClientRouter: Dropdown opens, and closes on Escape", async () => {
      const dropdown = page.locator(".dropdown_wrap").first();
      const open = () =>
        dropdown
          .locator(".dropdown_content")
          .evaluate((c) => c.matches(":popover-open"));
      await dropdown.scrollIntoViewIfNeeded();
      await dropdown.locator(".dropdown_toggle").click();
      assert.equal(await open(), true);
      await page.keyboard.press("Escape");
      assert.equal(await open(), false);
    });
    await it("ClientRouter: Modal opens", async () => {
      const trigger = page.locator("[data-modal-open]").first();
      const id = await trigger.getAttribute("data-modal-open");
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.waitForTimeout(300);
      const open = await page
        .locator(`#${id}`)
        .evaluate((d: HTMLDialogElement) => d.open);
      await page.keyboard.press("Escape");
      assert.ok(open);
    });
    await it("ClientRouter: Marquee pauses", async () => {
      const marquee = page.locator(".marquee_wrap").first();
      await marquee.scrollIntoViewIfNeeded();
      const before = await marquee.getAttribute("data-state");
      await marquee
        .locator("[data-marquee-toggle]")
        .evaluate((button: HTMLButtonElement) => button.click());
      assert.notEqual(await marquee.getAttribute("data-state"), before);
    });
    await it("ClientRouter: Compare follows its handle", async () => {
      const input = page.locator("input[data-compare]").first();
      await input.scrollIntoViewIfNeeded();
      await input.focus();
      await page.keyboard.press("ArrowRight");
      const value = await input.inputValue();
      assert.equal(
        await input.evaluate((i) =>
          i.parentElement!.style.getPropertyValue("--_position"),
        ),
        `${value}%`,
      );
    });
    await it("ClientRouter: Range fills to its value", async () => {
      const range = page.locator(".form-range").first();
      await range.scrollIntoViewIfNeeded();
      await range.locator(".form-range_input").focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await range.evaluate((r: HTMLElement) => {
          const input = r.querySelector("input")!;
          const min = Number(input.min || 0);
          const max = Number(input.max || 100);
          return (
            Number(r.style.getPropertyValue("--_progress")) ===
            (Number(input.value) - min) / (max - min)
          );
        }),
        true,
      );
    });
    await it("ClientRouter: Video's button pauses it", async () => {
      const button = page.locator("[data-video-toggle]").first();
      await button.scrollIntoViewIfNeeded();
      const playing = () =>
        button.evaluate((b) => b.hasAttribute("data-playing"));
      const before = await playing();
      await button.click();
      await page.waitForTimeout(200);
      assert.notEqual(await playing(), before);
    });
    await it("ClientRouter: Reveal shows content", async () => {
      const block = page.locator("[data-animate]").last();
      await block.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("[data-animate]")]
            .at(-1)
            ?.classList.contains("is-revealed"),
        null,
        { timeout: 2000 },
      );
    });
    await it("ClientRouter: the color mode a visitor picked stays", async () => {
      await page.locator(".theme-toggle_wrap").first().click();
      const mode = await page.evaluate(
        () => document.documentElement.dataset.mode,
      );
      await page.locator('.footer_link[href="/style-guide"]').click();
      await page.waitForURL("**/style-guide");
      await page.waitForTimeout(300);
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.mode),
        mode,
      );
      // The switch offers the other mode, by name.
      const other = mode === "dark" ? "light" : "dark";
      assert.equal(
        await page
          .getByRole("button", { name: `Switch to ${other} mode` })
          .count(),
        1,
      );
      // The page shows it, both ways: no page pins a theme the switch can't change.
      const scheme = () =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        );
      assert.equal(await scheme(), mode);
      // Back to the system's own mode: the choice is forgotten, and the page
      // follows the system again.
      await page.locator(".theme-toggle_wrap").first().click();
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.mode),
        undefined,
      );
      assert.equal(await scheme(), "light dark");
    });
    await it("ClientRouter: the phone menu opens", async () => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.locator(".nav_toggle").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".nav_toggle")
            ?.getAttribute("aria-expanded") === "true",
        null,
        { timeout: 2000 },
      );
    });

    // The same site with the CSP on, and without ClientRouter, which Astro's
    // CSP doesn't support. Anything the policy blocks fails the check.
    edit(
      "src/consts.ts",
      "export const CSP: boolean = false;",
      "export const CSP: boolean = true;",
    );
    edit(
      "src/layouts/BaseLayout.astro",
      "<BaseHead {...seo} />\n    <ClientRouter />",
      "<BaseHead {...seo} />",
    );
    execFileSync("npm", ["run", "build"], {
      cwd: site,
      stdio: ["ignore", "ignore", "inherit"],
    });
    const csp = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const blocked: string[] = [];
    await csp.addInitScript(() =>
      document.addEventListener("securitypolicyviolation", (event) =>
        console.error(
          `CSP blocked ${event.effectiveDirective}: ${event.blockedURI} ${event.sample}`,
        ),
      ),
    );
    csp.on("console", (message) => {
      if (message.type() === "error") blocked.push(message.text());
    });
    csp.on("pageerror", (error) => errors.push(error.message));

    await it("CSP: every page is under the policy, and nothing on it is blocked", async () => {
      for (const path of [
        "/",
        "/style-guide",
        "/components",
        "/test/tabs-scripts",
        "/test/form-scripts",
        "/test/marquee-video",
        "/test/code",
      ]) {
        await csp.goto(`${origin}${path}`);
        assert.ok(
          await csp
            .locator('meta[http-equiv="content-security-policy"]')
            .count(),
          `${path} has no policy`,
        );
        await csp.evaluate(() => scrollTo(0, document.body.scrollHeight));
        await csp.waitForTimeout(200);
      }
      assert.ok(!blocked.length, [...new Set(blocked)].join("\n"));
    });
    await it("CSP: the color mode script and the component scripts run", async () => {
      await csp.goto(`${origin}/test/tabs-scripts`);
      // The inline script applies a stored choice before the page paints.
      await csp.evaluate(() => localStorage.setItem("trix-mode", "dark"));
      await csp.reload();
      assert.equal(
        await csp.evaluate(() => document.documentElement.dataset.mode),
        "dark",
      );
      await csp.evaluate(() => localStorage.removeItem("trix-mode"));
      // The tabs' own script switches tabs.
      const second = csp.locator(".tabs_link").nth(1);
      await second.click();
      assert.equal(await second.getAttribute("aria-selected"), "true");
    });
    await it("CSP: inline style attributes apply — components' props and code colors", async () => {
      await csp.goto(`${origin}/test/marquee-video`);
      const [declared, applied] = await csp
        .locator(".marquee_wrap")
        .evaluate((marquee) => [
          /--_count:\s*(\d+)/.exec(marquee.getAttribute("style")!)![1],
          getComputedStyle(marquee).getPropertyValue("--_count"),
        ]);
      assert.equal(applied, declared);
      await csp.goto(`${origin}/test/code`);
      const token = csp.locator(".astro-code span[style]").first();
      const [style, color] = await token.evaluate((span) => [
        span.getAttribute("style")!,
        getComputedStyle(span).color,
      ]);
      const hex = /color:\s*#([0-9a-f]{6})/i.exec(style)![1];
      assert.equal(
        color,
        `rgb(${[0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`,
      );
    });
    // ClientRouter prefetches on its own; without it, the config has to.
    await it("without ClientRouter, hovering a link prefetches its page", async () => {
      await csp.goto(`${origin}/`);
      await csp.locator('.footer_link[href="/style-guide"]').hover();
      await csp.waitForFunction(
        () =>
          document.querySelector('link[rel="prefetch"][href$="/style-guide"]'),
        null,
        { timeout: 2000 },
      );
    });

    await it("no script errors on any of it", async () =>
      assert.ok(!errors.length, errors.join("\n")));
  } finally {
    await browser.close();
    server.close();
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(
  failures.length
    ? `\n${failures.length} of ${passed + failures.length} component checks fail.`
    : `\n${passed} component checks pass.`,
);
if (failures.length) process.exitCode = 1;
