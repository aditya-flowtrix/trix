#!/usr/bin/env node
/**
 * The go-live check for a self-hosted consent backend. Run it once after the
 * first deploy, and after any change to the backend or its database.
 * Through the public URLs it checks what local testing can't:
 *
 *   - the backend answers, and trusts the site's origin (CORS)
 *   - a real Accept on the live site is saved: TLS to the database,
 *     Hyperdrive and Cloudflare's network all work
 *   - the saved time reads back as it was clicked, so the database's time
 *     zone is UTC
 *
 * It records one real consent from the live site. Write it into PROJECT.md →
 * Consent with the date: it is evidence like any other and is never deleted.
 *
 * Usage:
 *   node .agents/skills/trix-consent/live-check.ts --site https://www.example.com
 *     --backend https://consent.example.com/api/c15t
 */

import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { launch } from "../../../scripts/measure/browser.ts";

/** Whether the read-back holds a time within two minutes of the click's. */
export function timesAgree(
  readBack: string,
  givenAt: string | number,
): boolean {
  const clicked = new Date(givenAt).getTime();
  const times = [
    ...readBack.matchAll(
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g,
    ),
  ].map(([iso]) => new Date(iso).getTime());
  for (const [, ms] of readBack.matchAll(/:\s*(\d{13})\b/g))
    times.push(Number(ms));
  return times.some((t) => Math.abs(t - clicked) <= 120_000);
}

// Self-check: a UTC database agrees; one in UTC+05:30 is off by hours.
assert.ok(
  timesAgree(
    '{"givenAt":"2026-10-15T10:00:30.000Z"}',
    "2026-10-15T10:00:00.000Z",
  ),
);
assert.ok(
  !timesAgree(
    '{"givenAt":"2026-10-15T15:30:00.000Z"}',
    "2026-10-15T10:00:00.000Z",
  ),
);
assert.ok(!timesAgree('{"subject":"sub_1"}', "2026-10-15T10:00:00.000Z"));

const { values } = parseArgs({
  options: { site: { type: "string" }, backend: { type: "string" } },
});
if (!values.site || !values.backend) {
  console.log(
    "Usage: live-check.ts --site https://www.example.com --backend https://consent.example.com/api/c15t",
  );
  process.exit(values.site || values.backend ? 1 : 0);
}
const site = new URL(values.site).origin;
const backend = values.backend.replace(/\/$/, "");

const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    console.log(`FAIL  ${name}\n      ${(error as Error).message}`);
    process.exit(1);
  }
};

await step("The backend answers /status", async () => {
  const res = await fetch(`${backend}/status`);
  assert.equal(res.status, 200, `status ${res.status}`);
});

await step("The backend trusts the site's origin", async () => {
  const res = await fetch(`${backend}/init`, { headers: { origin: site } });
  assert.equal(res.status, 200, `status ${res.status}`);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    site,
    `add ${site} to trustedOrigins in consent-api/src/settings.ts`,
  );
});

let saved: { subjectId: string; givenAt: string | number } | undefined;

await step("Accept all on the live site is saved by the backend", async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(site);
    // Caught at once: it can time out while the clicks below still run.
    const saving = page
      .waitForResponse(
        (r) =>
          r.url().startsWith(`${backend}/subjects`) &&
          r.request().method() === "POST",
        { timeout: 20_000 },
      )
      .catch(() => null);
    const banner = page.locator(
      '[data-consent-banner] [data-consent-action="accept"]',
    );
    // Where this machine's location gets no banner, the footer opens the panel.
    const shown = await banner
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(
        () => true,
        () => false,
      );
    if (!shown) {
      await page
        .locator("[data-consent-open] [data-modal-open]")
        .click({ timeout: 10_000 })
        .catch(() => {
          throw new Error(
            "neither the banner nor Cookie settings showed: is ConsentBanner in the layout, and does /init resolve a policy?",
          );
        });
      await page
        .locator('#consent-settings [data-consent-action="accept"]')
        .click();
    } else await banner.click();
    const res = await saving;
    if (!res)
      throw new Error(
        "no save reached the backend: is BACKEND_URL set in src/consent.ts, and the site rebuilt?",
      );
    assert.ok(
      res.status() < 300,
      `save answered ${res.status()}: ${await res.text()}`,
    );
    saved = await res.json();
    assert.ok(saved?.subjectId, "the save returned no subjectId");
  } finally {
    await browser.close();
  }
});

await step(
  "The saved time reads back as clicked (database in UTC)",
  async () => {
    const res = await fetch(`${backend}/subjects/${saved!.subjectId}`, {
      headers: { origin: site },
    });
    const body = await res.text();
    assert.equal(res.status, 200, `status ${res.status}: ${body}`);
    assert.ok(
      timesAgree(body, saved!.givenAt),
      `no time near ${saved!.givenAt} in ${body.slice(0, 300)} — run SHOW timezone; it must be UTC`,
    );
  },
);

console.log(
  `\nLive. Record this check's consent in PROJECT.md → Consent: subject ${saved!.subjectId}.`,
);
