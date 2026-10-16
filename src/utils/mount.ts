type Setup<T extends Element> = (element: T, signal: AbortSignal) => void;
type Mount = { setup: Setup<Element>; live: Map<Element, AbortController> };

const mounts = new Map<string, Mount>();

const start = (selector: string, { setup, live }: Mount) => {
  for (const element of document.querySelectorAll(selector)) {
    if (live.has(element)) continue;
    const controller = new AbortController();
    live.set(element, controller);
    try {
      setup(element, controller.signal);
    } catch (error) {
      // One element that fails leaves the others working, and still reports.
      reportError(error);
    }
  }
};

// Astro's ClientRouter swaps pages without reloading them. What left with the
// old page is torn down, and what came with the new one is set up before it
// is shown. An element kept with transition:persist stays as it is.
document.addEventListener("astro:after-swap", () => {
  for (const { live } of mounts.values())
    for (const [element, controller] of live)
      if (!element.isConnected) {
        controller.abort();
        live.delete(element);
      }
  for (const [selector, mount] of mounts) start(selector, mount);
});

/**
 * Sets up each element matching `selector`, once: those on the page now, and
 * those each page brings in when Astro's ClientRouter swaps pages. `signal`
 * aborts when the element leaves the page — pass it to listeners on
 * `document`, `window` or a media query, and stop timers and observers on it.
 * Used by every component whose script sets up elements.
 */
export function mount<T extends Element = HTMLElement>(
  selector: string,
  setup: Setup<T>,
) {
  if (mounts.has(selector)) return;
  const entry: Mount = { setup: setup as Setup<Element>, live: new Map() };
  mounts.set(selector, entry);
  start(selector, entry);
}
