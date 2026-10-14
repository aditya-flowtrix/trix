/**
 * The docs site's own settings. Trix's components import `src/consts.ts`;
 * site/astro.config.mjs points that import here, so the framework's
 * components render this site with its name, URL and color mode.
 */
export const SITE_NAME = "Trix";
export const SITE_DESCRIPTION =
  "A design-ready Astro framework: Lumos's components, Mast's 12-column grid, tokens shared with Figma, and agent skills that move sites in.";
/** Set to the docs domain before the first deploy. */
export const SITE_URL = "https://trix.example.com";
export const SITE_LOCALE = "en-US";
export const SITE_SOCIALS: string[] = [
  "https://github.com/aditya-flowtrix/trix",
];
export const NOINDEX_ROUTES: string[] = ["/404"];
export const COLOR_MODE: "light" | "dark" | "auto" = "auto";

/** Where the framework lives: edit links, the header, installation. */
export const REPO = "https://github.com/aditya-flowtrix/trix";
/** The command that starts a project. */
export const CREATE_COMMAND =
  "npm create astro@latest -- --template aditya-flowtrix/trix";
