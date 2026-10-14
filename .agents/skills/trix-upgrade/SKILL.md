---
name: trix-upgrade
description: Upgrade a site built on Trix to the latest Trix, or pull upstream Lumos for Astro changes into the Trix framework itself. Use when the user asks to upgrade Trix, update the framework, pull in the newest components, or sync Trix with Lumos. Moves the site onto the latest names, placements and props while keeping every customization the user made.
---

# Upgrading a Trix site

Two things have to be true when this finishes, and they pull against each
other:

1. **Nothing the user wrote is lost.** Their overrides, their pages, their
   tokens, their components.
2. **Nothing is left on old conventions.** Renamed props renamed, moved
   components moved, retired patterns retired.

Keeping their work by leaving it alone fails the second. Modernising by
overwriting fails the first. The way through is a three-way merge — what they
started from, what they have now, what ships today — and the discipline to ask
rather than guess when those three disagree.

## Where the site started

An upgrade is only as good as its knowledge of the starting point.

```bash
node -p "JSON.parse(require('fs').readFileSync('package.json')).trix ?? 'unstamped'"
```

- **Stamped** — `{ version, commit, created }` written by `/trix-new-project`.
  The version is the release the site came from, for reading; the commit is
  what to merge against, and it is the one that matters. They are not
  redundant: a site scaffolded between releases is that version plus whatever
  landed after it, and only the commit says how much. Sites stamped before the
  version was added carry the commit alone, which is enough. That commit
  is the merge base. Fetch it and you know exactly which lines are the
  framework's and which are the user's.
- **Unstamped** — the site predates stamping. Treat the oldest Trix release as the base. Say
  so in the report, plainly: the base is a guess, so more of the merge will
  land as conflicts and more of it needs eyes.

The site's own `package.json` version says nothing about the framework. Only
the `trix` field does.

## Steps

### 1. Commit what is there

Refuse to start on a dirty tree — a mid-upgrade diff is unreadable if it is
mixed with yesterday's work.

```bash
git status --porcelain          # must be empty
git commit --allow-empty -m "Before Trix upgrade"
```

The empty commit is deliberate: it is the anchor the whole upgrade is read
against, and `git diff <that commit>` becomes the review.

### 2. Photograph the site

Before anything changes, with the dev server running:

```bash
astro dev --background
node .agents/skills/trix-upgrade/visual-check.mjs capture before
```

Every static route at desktop and mobile. This is the evidence that step 8
checks against, and it cannot be taken afterwards.

### 3. Get both reference copies

```bash
npx degit aditya-flowtrix/trix .trix-upgrade/latest    # what ships now
```

And the merge base — the commit the site was scaffolded from:

```bash
curl -sL https://codeload.github.com/aditya-flowtrix/trix/tar.gz/<commit> \
  | tar -xz -C .trix-upgrade --one-top-level=base --strip-components=1
```

Now three trees exist: `base` (where they started), the site (where they are),
`latest` (where they are going).

### 4. Sort every file into one of four piles

For each file in the framework's surface — components, layouts, styles, utils:

| base vs site | base vs latest | What it is                             | What to do                               |
| ------------ | -------------- | -------------------------------------- | ---------------------------------------- |
| same         | same           | untouched both sides                   | leave                                    |
| same         | **changed**    | framework moved, user never touched it | take latest wholesale                    |
| **changed**  | same           | user's override, framework unchanged   | keep theirs                              |
| **changed**  | **changed**    | both moved                             | three-way merge, conflicts to the report |

`src/pages`, `src/content`, `src/assets` and `PROJECT.md` are the user's by
definition — never replace them. They still need migrating in step 6.

`src/styles/generated/`, `design/tokens/` and `docs/tokens.md` are never
merged: they are regenerated from the merged tokens with `npm run tokens`.

**`.agents/skills` upgrades wholesale.** In Trix no skill holds project data —
the migration and design-system record lives in `PROJECT.md`, which is the
project's. If an older site still has a filled-in **This project** section
inside a skill (a Lumos-era habit), move it into `PROJECT.md` verbatim before
taking the new skill, and say so in the report.

### 5. Merge `tokens.css` and `themes.css` rather than replacing them

Global CSS is the file most likely to be in the fourth pile: the framework adds
tokens, the user changes brand colours and fonts. Merge it three ways, token by
token, and hold to two rules:

- A token the user changed keeps their value, even when the framework changed
  the default. Their brand colour is not a stale default.
- A token the framework added arrives with the framework's value, placed in its
  own section — not appended to the end.

Every token where both sides changed goes in the report with both values. Do
not pick for them. Then run `npm run tokens` — the generated CSS, prop types,
Figma files and token docs follow the merged tokens.

### 6. Migrate the site's own code

Diff `base` against `latest` to learn what moved, then apply it to `src/pages`
and anything the user wrote:

- **Renamed or moved components** — update every import and tag. A component
  that moved folders and lost a prefix (`FormInput` → `Form/Input.astro`) is
  two changes in one; get both.
- **Renamed props** — rename at every call site.
- **Removed props** — **stop and ask.** For each one, offer the three real
  options: keep the prop as a local override, drop it, or move to whatever
  replaced it. Never decide silently; a removed prop usually meant something.
- **Deleted components** — **keep the user's copy.** Copy the component from
  `base` into the site's own component folder so the site still builds and
  still looks the same, and flag it: it is no longer maintained by the
  framework, and here is what replaced it, if anything.

### 7. Prove it builds

```bash
npm run check && npm run build
```

Both clean before going near the screenshots. A type error found now is a
migration that was missed.

**Check the Astro pairing while you are already here.** Astro is the site's own
dependency, not the framework's — Trix is copied in, not installed — so an
upgrade is the natural moment to look, not a licence to force one. Compare the
site's `astro` against the release being merged in; if the site is behind on a
major, say so in the report and let its owner decide.

Bump it with `npx @astrojs/upgrade` rather than by hand. It moves the
`@astrojs/*` integrations with Astro, and `@astrojs/sitemap` declares no peer
dependency on astro — so a mismatched pair installs without a word and turns up
as a build failure, or as a sitemap that silently stops being written.

### 8. Prove nothing moved

```bash
node .agents/skills/trix-upgrade/visual-check.mjs capture after
node .agents/skills/trix-upgrade/visual-check.mjs compare
```

Pixel-diffs every route against step 2 with a tolerance for antialiasing, and
writes a highlighted diff for anything above 0.1% of pixels. Exit code is
non-zero when something moved.

**An upgrade that changes the design has gone wrong somewhere** — a token
merged the wrong way, a prop dropped, a component swapped for one that is not
quite the same. Work backwards from the diff image until each one is explained.
Some are legitimate: a genuine bug fix upstream will move pixels. The rule is
not "no differences", it is **"no unexplained differences"**.

### 9. Commit the result

```bash
git add -A && git commit -m "Upgrade Trix to <commit>"
```

Update the stamp in `package.json` to the commit just merged, so the next
upgrade has an exact base. Then delete `.trix-upgrade/`.

## The report

- **Taken from latest** — files replaced wholesale, because they were untouched.
- **Kept as yours** — overrides preserved, framework changes declined.
- **Merged** — files where both sides moved, with what came from where.
- **Migrated** — renames and moves applied to the user's own code, counted.
- **Kept alive** — components deleted upstream that were copied into the site,
  with what replaced them.
- **Answered** — removed props and how the user chose to resolve each.
- **Visual differences** — every view that moved, and why.
- **Still open** — anything unresolved. An upgrade may finish with this list
  non-empty, as long as it is stated.

## Versions

- **Skill version** — 1.0.0.
- **Framework** — Trix is versioned in `package.json` (`trix.version`) and
  `CHANGELOG.md`. Prefer a tagged release as "latest" and read the changelog in
  step 4 rather than diffing blind; the stamp's commit stays the merge base.

## Using this without Claude Code

The steps are plain git and node. `visual-check.mjs` needs headless Chrome and
sharp, both of which an Astro project on a Mac already has. Only the automatic
triggering and `/trix-upgrade` are Claude Code features.

## Maintaining Trix: pulling from upstream Lumos

Trix is a fork of [Lumos for Astro](https://github.com/lumosframework/lumos-for-astro)
with its history intact, so upstream work arrives by merge, not by copy.

```bash
git fetch upstream
git log --oneline <trix.basedOn.commit>..upstream/main   # what Lumos changed since
git merge upstream/main
```

Expect conflicts where Trix diverged on purpose, and resolve them toward
Trix's conventions:

| Lumos                                           | Trix                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| tokens, themes and text styles in `base.css`    | `tokens.css`, `themes.css`, generated `text-styles.css`     |
| `--space-1…8`                                   | `--space-1…12` — Lumos step N is Trix step N+1, same values |
| `--radius-main`                                 | `--radius-medium`                                           |
| breakpoint `64rem`                              | `62rem` (Webflow's 992px)                                   |
| `--light-*`, `--dark-*`, `--brand-500` swatches | `--neutral-*`, `--brand-*` ramps                            |
| `[lumos]` dev warnings, `lumos-*` skills        | `[trix]`, `trix-*`                                          |
| project record inside the Webflow skill         | `PROJECT.md`                                                |

After the merge: `npm run tokens && npm run check && npm run build`, then
update `trix.basedOn` in `package.json` to the merged upstream commit and add
a CHANGELOG entry.
