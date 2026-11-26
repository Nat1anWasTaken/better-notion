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

1. Bump `version` in `package.json` and commit.
2. Tag it and push: `git tag v0.2.0 && git push --tags`.

The release workflow builds the script and attaches `better-notion.user.js`
and `better-notion.meta.js` to a GitHub release.
