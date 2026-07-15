import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { assertReleaseTag } from "../scripts/check-release-tag.mjs";
import { validatePackageManifest } from "../scripts/verify-package.mjs";

it("publishes only the built CLI and public documents", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  expect(pkg.bin).toEqual({ "cursor-coworker": "dist/src/cli.js" });
  expect(pkg.files).toEqual([
    "dist/src", "dist/bench", "dist/skills", "docs/benchmark.md", "README.md", "LICENSE"
  ]);
  expect(pkg.repository?.url).toContain("cursor-coworker");
});

it("contains the independence disclaimer", async () => {
  const readme = await readFile("README.md", "utf8");
  expect(readme).toContain("not affiliated with or endorsed by Cursor");
});

it("documents skill installation and the opt-in trigger experiment", async () => {
  const readme = await readFile("README.md", "utf8");
  const benchmark = await readFile("docs/benchmark.md", "utf8");
  expect(readme).toContain("install-skill codex");
  expect(readme).toContain("install-skill claude");
  expect(readme).toContain("--scope user");
  expect(readme).toContain("cursor-coworker instructions claude");
  expect(readme).toContain("existing `CLAUDE.md`");
  expect(readme).toContain("does not modify");
  expect(benchmark).toContain("cases.skill-trigger.json");
  expect(benchmark).toContain("## Opt-in Claude Code Agent Skill trigger experiment");
  expect(benchmark).toContain("invokes real Claude Code");
  expect(benchmark).not.toContain("Codex or Claude Code");
  expect(benchmark).not.toContain("each host");
  expect(benchmark).toContain("CURSOR_COWORKER_TRIGGER_LOG");
  expect(benchmark).toContain("80%");
  expect(benchmark).toContain("10%");
  expect(benchmark).toContain("partial indexed context");
  expect(benchmark).toContain("complete narrow answer");
  expect(benchmark).toContain("install-skill claude");
  expect(benchmark).toContain("node dist/src/cli.js instructions claude");
  expect(benchmark).toContain(".claude/CLAUDE.md");
  expect(benchmark).toContain("current Cursor Coworker checkout");
  expect(benchmark).toContain('source="$(git rev-parse --show-toplevel)"');
  expect(benchmark).not.toContain("https://example.com/some/real-repo.git");
  expect(benchmark).toContain("self-contained");
  expect(benchmark).toContain("grounded in the cloned repository");
  expect(benchmark).not.toContain("Use a vanilla host session");
  expect(benchmark).not.toContain("suppresses the trigger by design");
});

it("declares the first public npm release and publication guard", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  expect(pkg.version).toBe("0.1.2");
  expect(pkg.publishConfig).toEqual({ access: "public" });
  expect(pkg.scripts.prepublishOnly).toBe("npm run check && npm run verify:package");
});

it("documents one-off, global, and host-skill installation", async () => {
  const readme = await readFile("README.md", "utf8");
  expect(readme).toContain("npx cursor-coworker doctor");
  expect(readme).toContain("npm install --global cursor-coworker");
  expect(readme).toContain("cursor-coworker install-skill codex --scope user");
  expect(readme).toContain("cursor-coworker install-skill claude --scope user");
});

it("rejects a package manifest without the bundled skill", () => {
  const pkg = { bin: { "cursor-coworker": "dist/src/cli.js" } };
  const report = {
    files: [
      { path: "dist/src/cli.js" },
      { path: "README.md" },
      { path: "LICENSE" },
      { path: "package.json" }
    ]
  };
  expect(() => validatePackageManifest(pkg, report)).toThrow(
    "Missing package file: dist/skills/cursor-coworker/SKILL.md"
  );
});

it("verifies and installs the produced package without Cursor authentication", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-package.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "verified",
    package: "cursor-coworker",
    version: "0.1.2",
    skillInstalled: true
  });
  // ponytail: real npm pack/install subprocess, slower on Windows CI runners
}, 30_000);

it("requires the release tag to exactly match the package version", () => {
  expect(() => assertReleaseTag("v0.1.0", "0.1.0")).not.toThrow();
  expect(() => assertReleaseTag("v0.1.1", "0.1.0")).toThrow(
    "Release tag v0.1.1 does not match package version 0.1.0"
  );
});

it("publishes version tags through npm trusted publishing", async () => {
  const workflow = await readFile(".github/workflows/release.yml", "utf8");
  expect(workflow).toContain("tags: [\"v*\"]");
  expect(workflow).toContain("id-token: write");
  expect(workflow).toContain("node scripts/check-release-tag.mjs");
  expect(workflow).toContain("npm run check");
  expect(workflow).toContain("npm run verify:package");
  expect(workflow).toContain("npm publish --access public --provenance");
  expect(workflow).not.toContain("NODE_AUTH_TOKEN");
  expect(workflow).not.toContain("NPM_TOKEN");
});

it("documents bootstrap and recurring npm releases", async () => {
  const release = await readFile("docs/releasing.md", "utf8");
  expect(release).toContain("npm publish --access public");
  expect(release).toContain("npm publish --access public --provenance");
  expect(release).toContain("GitHub Actions");
  expect(release).toContain("Trusted Publisher");
  expect(release).toContain("npm view cursor-coworker@0.1.0");
  expect(release).toContain("npx --yes cursor-coworker@0.1.0 doctor");
});
