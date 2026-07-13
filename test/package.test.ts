import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

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
  expect(benchmark).toContain("cases.skill-trigger.json");
  expect(benchmark).toContain("CURSOR_COWORKER_TRIGGER_LOG");
  expect(benchmark).toContain("80%");
  expect(benchmark).toContain("10%");
});

it("declares the first public npm release and publication guard", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  expect(pkg.version).toBe("0.1.0");
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
