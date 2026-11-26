# Better Notion

A userscript with my personal tweaks to Notion.

## Install

1. Install a userscript manager such as [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [latest release script](https://github.com/Nat1anWasTaken/better-notion/releases/latest/download/better-notion.user.js) and confirm the install.

The script checks the latest GitHub release for updates.

## Development

```sh
pnpm install
pnpm dev      # serves a dev userscript that reloads from the Vite server
pnpm check    # lint, typecheck, test and build
```

Each tweak lives in `src/tweaks/` and is registered in `src/tweaks/index.ts`.
The runner isolates tweaks, so one that throws doesn't stop the others.

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please)
and driven by [Conventional Commits](https://www.conventionalcommits.org/):

1. Push `feat:` / `fix:` commits to `main`. release-please opens (and keeps updating) a
   release PR that bumps `package.json` and writes `CHANGELOG.md`.
2. Merge the release PR. That tags the version, creates the GitHub release and attaches
   `better-notion.user.js` and `better-notion.meta.js`.

While the version is below 1.0.0, `feat:` bumps the minor version, `fix:` bumps the patch and
a breaking change (`feat!:`) bumps the minor version.
