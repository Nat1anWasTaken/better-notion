# AGENTS.md

Better Notion is a userscript with personal tweaks for Notion, built with Vite and
`vite-plugin-monkey`. The output is `dist/better-notion.user.js`.

## Commands

Use pnpm (the version is pinned in `package.json`).

```sh
pnpm install   # also installs the commit-msg hook
pnpm dev       # dev userscript served from Vite
pnpm check     # lint, typecheck, test and build; run before committing
pnpm format    # apply Biome fixes
```

## Layout

- `src/main.ts` runs every registered tweak through `src/runner.ts`, which catches errors so one
  broken tweak doesn't stop the others.
- `src/tweaks/` holds one file (or folder) per tweak, exporting a `Tweak` (see `types.ts`), plus
  `*.test.ts` next to it. Register new tweaks in `src/tweaks/index.ts`.
- `src/settings/` holds the settings store (GM storage) and the "Better Notion" section injected
  into Notion's Settings dialog. Tweaks declare `options` and read them through the `ctx` passed to
  `run`; return a cleanup from `run` so the tweak can be switched off live.
- `vite.config.ts` holds the userscript header (`@match`, `@run-at`, update URLs).

## Writing tweaks

- The Notion app is served from `https://app.notion.com`; `www.notion.so` redirects there and
  `www.notion.com` is the marketing site. Keep `@match` in `vite.config.ts` in sync with that.
- The script runs at `document-start`, so `<head>` and `<body>` may not exist yet. Observe
  `document` rather than querying once.
- Notion is a single-page app: page changes don't reload the script. Tweaks have to react to DOM
  changes (for example with a `MutationObserver`), not just apply once.
- Notion's DOM and class names are unstable. Prefer semantic hooks (element types, `rel`, ARIA
  attributes) over generated class names.
- Live markdown edits blocks through Notion's private data layer (`src/tweaks/live-markdown/notion/`):
  the block store on a block element's React props, and the transaction functions found through
  the bundler's chunk array. Module ids change with every Notion release, so find modules by export
  name or source, never by id, and check every lookup. If one fails, the tweak must stay off
  rather than edit text some other way.
- Tests run in Vitest. Add `// @vitest-environment happy-dom` at the top of tests that need a DOM.
  Unit tests don't prove a tweak works on Notion; check behaviour in the real app when you can.

## Commits

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/). A
`commit-msg` hook runs commitlint locally, and the Commitlint workflow checks pushed commits and PR
titles (a squash merge uses the title as the commit message). Don't bypass the hook.

The type decides the release, so pick it for what users of the script see:

| Type                                                                | Use for                                     | Release (while < 1.0) |
| ------------------------------------------------------------------- | ------------------------------------------- | --------------------- |
| `feat`                                                              | a new tweak or new behaviour                | minor                 |
| `fix`                                                               | a bug fix in a tweak                        | patch                 |
| `feat!` / `BREAKING CHANGE:` footer                                 | removing or changing behaviour incompatibly | minor                 |
| `chore`, `ci`, `test`, `docs`, `refactor`, `build`, `perf`, `style` | everything else                             | none                  |

Use a scope for the tweak when it helps, e.g. `fix(favicon): ...`. One logical change per commit.

## Releases

Releases are automated by release-please (`.github/workflows/release.yml`):

1. `feat`/`fix` commits on `main` make release-please open or update a release PR that bumps
   `package.json` and `CHANGELOG.md`.
2. Merging that PR tags the release, creates the GitHub release and attaches
   `better-notion.user.js` and `better-notion.meta.js`. Installed scripts update from there.

Don't edit `version` in `package.json`, `.release-please-manifest.json` or `CHANGELOG.md` by
hand, and don't create tags or releases manually. To force a version, add a `Release-As: x.y.z`
footer to a commit. Merging the release PR publishes a release, so leave that to the maintainer
unless asked.

## Dependencies

pnpm blocks dependency install scripts unless they are listed under `allowBuilds` in
`pnpm-workspace.yaml`. Allow one only when the package needs it to work; otherwise deny it there
(`pnpm approve-builds '!<pkg>'`) so installs, including in CI, don't fail.
