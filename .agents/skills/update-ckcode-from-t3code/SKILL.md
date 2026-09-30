---
name: update-ckcode-from-t3code
description: Use when updating, syncing, or pulling the CKcode fork up to date with upstream T3 Code (pingdotgg/t3code), resolving merge conflicts between the fork and upstream, or when CKcode is missing recent upstream fixes and features.
---

# Update CKcode from T3 Code

CKcode (`chanatundev/ckcode`) is a fork of T3 Code (`pingdotgg/t3code`) whose
history contains upstream. Update it with a **merge** of `upstream/main`.
Never rebase fork commits and never force-push: `main` is published, and a merge
keeps every later sync's merge-base correct.

## 1. Preflight

```bash
git status --short                      # must be clean apart from untracked noise
git remote get-url upstream 2>/dev/null \
  || git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream main && git fetch origin main
git switch main && git merge --ff-only origin/main
MB=$(git merge-base HEAD upstream/main)
git rev-list --count HEAD..upstream/main   # 0 → already up to date, stop
git log --oneline --no-merges $MB..HEAD    # fork-only commits to protect
```

If the working tree has uncommitted work that isn't yours, stop and ask. Don't
stash or discard it.

## 2. Preview conflicts without touching the tree

```bash
git merge-tree --write-tree --name-only HEAD upstream/main
```

The lines after the tree hash are conflicted files. Before resolving each one, read
`git log --oneline $MB..HEAD -- <file>` and `git log --oneline $MB..upstream/main -- <file>`
so you know what each side meant to do.

## 3. Merge on a sync branch

```bash
UP=$(git rev-parse --short upstream/main)
git switch -c sync/t3code-$UP
git merge --no-ff --no-commit upstream/main
```

Resolve every conflict with the rules below, then run `vp i`. Commit when
`git diff --name-only --diff-filter=U` is empty and no `<<<<<<<` markers remain.

## Resolution rules

The default is to keep **both** sides: take upstream's change and re-apply the
fork's intent on top of it. Take one side wholesale only when a row below says so.

| Area                                                                                                                                                     | Rule                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork features (sidekick, `/goal` `/handoff` `/fork` `/pipeline`, MCP start-thread and computer-use tools, issue-link context, settled-project shortcuts) | Keep them. Port to upstream's new shape if upstream refactored the surrounding code. Listed in `README.md` under "Fork-specific additions".                                                                            |
| Branding                                                                                                                                                 | User-visible name stays **CKcode**: `apps/desktop/package.json` `productName`, desktop `APP_BASE_NAME`, `apps/desktop/resources/branding/*`, icon paths in `DesktopAssets.ts` and `scripts/build-desktop-artifact.ts`. |
| Nightly update track                                                                                                                                     | Stays removed. If upstream edits nightly channel code (`apps/desktop/src/updates/*`, `DesktopAppSettings.ts`, update IPC channel, update-track UI in `SettingsPanels.tsx`), keep the fork's stable-only behavior.      |
| `README.md`                                                                                                                                              | Keep the fork's version.                                                                                                                                                                                               |
| `AGENTS.md`, `docs/`, `.repos/`                                                                                                                          | Take upstream's version unless it has fork-specific edits.                                                                                                                                                             |
| `pnpm-lock.yaml`                                                                                                                                         | `git checkout --theirs pnpm-lock.yaml`, then `vp i` to regenerate it. Stage the result.                                                                                                                                |
| IPC channels, contracts, settings schemas                                                                                                                | Union both sides' entries. Don't drop an upstream channel, and don't drop a sidekick channel either.                                                                                                                   |

Leave internal identifiers alone: the `t3` CLI, `@t3tools/*` packages,
`~/.t3`, `T3CODE_*` env vars, `t3.codes` URLs, and T3 Connect.

### Branding sweep (required, even with zero conflicts)

Upstream keeps adding new "T3 Code" UI strings, and a clean merge brings them in
silently. Before committing:

```bash
git diff HEAD -U0 -- apps/web/src apps/desktop/src ':!*.test.*' \
  | grep -E '^\+\+\+ |^\+.*T3 Code' | grep -B1 '^+[^+]' | grep -v '^--$'
```

It prints each file header followed by its new "T3 Code" lines.

For each user-visible hit:

- **Web** (`apps/web/src`): wrap the string with `appBrandCopy(...)` from `~/branding`, or use `APP_BASE_NAME`.
- **Desktop** (`apps/desktop/src`): write `CKcode` literally, as the fork's existing strings do.
- Update any test that asserts the old string.

Mobile is not rebranded, so leave it.

## 4. Verify (targeted, never repo-wide)

For each package that had a conflict or a branding edit:

```bash
vp run --filter <@t3tools/web|@t3tools/desktop|t3|@t3tools/contracts|@t3tools/mobile> typecheck
vp test run <test files for the files you resolved>
```

Don't run `vp check`, `vp run -r typecheck`, or the full suite. CI covers those.
If a typecheck fails in a file you didn't touch, it is almost always a fork
feature that calls an API upstream renamed. Fix the fork code, not upstream's.

## 5. Commit and land

```bash
git commit    # message below
git switch main && git merge --ff-only sync/t3code-$UP && git branch -d sync/t3code-$UP
```

Commit message:

```
merge: sync upstream T3 Code <UP> into CKcode

Brings in <N> upstream commits (<MB short>..<UP>).
Conflicts: <file> — <what was kept from each side>; ...
Branding: <strings rewritten to CKcode, or "none">
```

Ask before running `git push origin main`, because it publishes the fork.

## Common mistakes

- **Rebasing onto upstream.** This rewrites 25+ published commits and breaks origin. Merge instead.
- **Resolving with `--theirs` or `--ours` on a whole file.** This silently drops the other side's feature. Use it only where the table allows it.
- **Skipping the branding sweep because nothing conflicted.** New upstream strings ship as "T3 Code".
- **Hand-merging `pnpm-lock.yaml`.** Regenerate it instead.
- **Restoring nightly UI** because upstream's `SettingsPanels.tsx` hunk looked like a clean improvement.
