/**
 * The migration CLI's view of the backend: `npm run migrate:plan`, then
 * `npm run migrate`. DATABASE_URL comes from the shell, never from a file in
 * the repository.
 */

import { defineConfig } from "@c15t/backend";
import { policyRules, trustedOrigins } from "./src/settings.ts";

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error(
    "Set DATABASE_URL to the database's direct (not pooled) connection string.",
  );

export default defineConfig({
  database: { dialect: "postgres", url },
  trustedOrigins,
  manifest: { policyRules },
});
