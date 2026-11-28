# Better Notion

A userscript with my personal tweaks to Notion.

## Tweaks

- **Static favicon**: keeps the tab icon on the Notion logo instead of the current page's icon,
  so Notion is easy to find in a collapsed vertical tab bar.
- **Live markdown**: edit Notion text as markdown, like Obsidian's Live Preview. The block under
  the caret shows its markdown (`## `, `**bold**`, `[link](url)`, `==highlight==`, `$equation$`,
  …) as real text you can edit: delete a `#` and the heading gets bigger, type `- ` and the line
  becomes a bullet. Formatting away from the caret stays rendered. Bullets, numbers, checkboxes,
  toggles and quotes keep Notion's look, and Backspace at their start turns them into text. Enter,
  Backspace, Tab and Shift-Tab split, merge and move blocks as in Notion, and `/`, `@` and `[[`
  open Notion's menus. Edits are saved through Notion's own transactions, so they sync, show up for
  collaborators and undo with ⌘Z.

## Settings

Open Notion's **Settings** and pick **Better Notion** at the bottom of the sidebar. Each tweak can
be turned off there, and tweaks with options list them underneath. Settings are kept in the
userscript manager's storage and shared by every Notion tab.

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
The runner isolates tweaks, so one that throws doesn't stop the others. A tweak that returns a
cleanup from `run` can be turned on and off from the settings section without a reload; options it
declares show up there automatically.

## Commits

Commit messages must follow Conventional Commits. `pnpm install` sets up a `commit-msg`
hook that runs commitlint, and CI checks pushed commits and PR titles.

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please)
and driven by [Conventional Commits](https://www.conventionalcommits.org/):

1. Push `feat:` / `fix:` commits to `main`. release-please opens (and keeps updating) a
   release PR that bumps `package.json` and writes `CHANGELOG.md`.
2. Merge the release PR. That tags the version, creates the GitHub release and attaches
   `better-notion.user.js` and `better-notion.meta.js`.

While the version is below 1.0.0, `feat:` bumps the minor version, `fix:` bumps the patch and
a breaking change (`feat!:`) bumps the minor version.
