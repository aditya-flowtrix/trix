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
  /** Saves per address, limited in wrangler.jsonc. */
  SAVES: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

// What a banner reads, and the browser's CORS preflight, save nothing.
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    // trustedOrigins only stops browsers: a script can post choices from
    // anywhere, and a consent record is never deleted. So each address's
    // saves are capped before they reach the database.
    if (!READS.has(request.method)) {
      const key = request.headers.get("cf-connecting-ip") ?? "";
      if (!(await env.SAVES.limit({ key })).success)
        return new Response("Too many requests.", {
          status: 429,
          headers: { "retry-after": "60" },
        });
    }
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
