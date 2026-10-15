/**
 * Cookie consent: the one c15t runtime for the site. Creating it does
 * nothing — the banner calls `start()`. Built by the trix-consent skill;
 * the decisions behind it are in PROJECT.md → Consent.
 */

import { hosted, offline, type Script } from "@c15t/core";
import { createConsentRuntime } from "@c15t/core/runtime";

/**
 * Where choices are recorded: the backend's URL, `/api/c15t` included. With
 * `null` they stay in each visitor's browser and nothing proves consent.
 */
const BACKEND_URL: string | null = null;

/**
 * Every third-party script, under the category that allows it. A script
 * outside this list loads before consent, and verify.ts fails the site.
 */
const scripts: Script[] = [];

// Only a production build writes to the record. `npm run dev` and verify.ts
// (PUBLIC_CONSENT_OFFLINE) keep choices in the browser: records are legal
// evidence and can't be deleted.
const recorded =
  BACKEND_URL &&
  import.meta.env.PROD &&
  !import.meta.env.PUBLIC_CONSENT_OFFLINE;

export const runtime = createConsentRuntime({
  mode: recorded ? hosted({ backendURL: BACKEND_URL }) : offline(),
  scripts,
});
