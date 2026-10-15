/**
 * The consent backend: c15t on a Cloudflare Worker, recording each visitor's
 * choice in Postgres. Consent records are legal evidence — never delete one.
 */

import { c15tInstance } from "@c15t/backend";
import { policyRules, trustedOrigins } from "./settings.ts";

interface Env {
  /** Pooled connections, in production. */
  HYPERDRIVE?: { connectionString: string };
  /** A direct connection string for `npm run dev`, in .dev.vars. */
  DATABASE_URL?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    const url = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;
    if (!url)
      return new Response("The consent database is not configured.", {
        status: 503,
      });
    // One instance per request: a Worker may not reuse a connection another
    // request opened, and a shared instance hangs on its first save.
    const instance = c15tInstance({
      basePath: "/api/c15t",
      database: { dialect: "postgres", url },
      trustedOrigins,
      manifest: { policyRules },
    });
    const response = await instance.handler(request);
    ctx.waitUntil(Promise.resolve(instance.dispose()));
    return response;
  },
};
