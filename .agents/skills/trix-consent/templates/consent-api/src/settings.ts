/**
 * What the consent backend enforces: the region rules and the sites allowed
 * to save. Read by the Worker and by the migration CLI. A rule is the site
 * owner's legal decision, recorded in the site's PROJECT.md → Consent.
 */

import {
  inspectPolicyRules,
  policyMatchers,
  policyRulePresets,
} from "@c15t/backend";

export const policyRules = [
  // EEA, UK and Gibraltar: nothing optional runs until the visitor accepts.
  // Also the fallback, so a visitor whose location is unknown gets the
  // strictest rule.
  policyRulePresets.europeOptIn(),
  // The US states with privacy laws: allowed until the visitor opts out, and
  // Global Privacy Control turns off marketing and measurement.
  policyRulePresets.usPrivacyStatesOptOut(),
  // Everyone else: opt-in, as in Europe.
  {
    id: "world_opt_in",
    match: policyMatchers.default(),
    model: "opt-in",
    prompt: "choice",
    validity: { choiceDays: 365 },
  } as const,
];

// A broken rule fails the deploy and the migration, not a visitor's banner.
const { errors } = inspectPolicyRules(policyRules);
if (errors.length)
  throw new Error(`Invalid consent rules:\n${errors.join("\n")}`);

/**
 * The sites allowed to save a choice: production, its www twin, staging.
 * No localhost — a developer's clicks are not consent records.
 */
export const trustedOrigins = [
  "https://example.com",
  "https://www.example.com",
];
