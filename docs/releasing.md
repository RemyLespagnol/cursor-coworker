# Releasing Cursor Coworker

## Bootstrap `0.1.0`

1. Confirm `npm whoami` returns the intended maintainer.
2. Confirm `npm view cursor-coworker` returns `E404` immediately before the first publish.
3. Run `npm ci`, `npm run check`, and `npm run verify:package`.
4. Review `npm pack --dry-run --json` and confirm version `0.1.0`.
5. Obtain explicit approval for the irreversible registry write.
6. Run `npm publish --access public`. Local bootstrap publication cannot attach GitHub provenance.
7. Verify with `npm view cursor-coworker@0.1.0`, `npx --yes cursor-coworker@0.1.0 doctor`, and `npx --yes cursor-coworker@0.1.0 install-skill codex --cwd <temporary-directory>`. `doctor` may return a non-zero diagnostic when Cursor is unavailable; resolving and launching the public executable is the smoke-test requirement.

## Configure trusted publishing

In the npm package settings, add a GitHub Actions Trusted Publisher for repository `RemyLespagnol/cursor-coworker` and workflow `release.yml`. No npm token is stored in GitHub. Later tag releases execute `npm publish --access public --provenance` in GitHub Actions.

## Later releases

1. Run `npm version <patch|minor|major> --no-git-tag-version`.
2. Update release-facing documentation when behavior changes.
3. Run `npm run check` and `npm run verify:package`.
4. Commit the version change.
5. Create and push the matching `v<version>` tag.
6. Watch the GitHub Actions release workflow.
7. Verify the exact registry version with `npm view` and `npx --yes`.

Published npm versions are immutable. If a release fails after publication, fix forward with a new version; never reuse a tag or version.
