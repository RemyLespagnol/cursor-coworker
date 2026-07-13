import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requiredFiles = [
  "dist/src/cli.js",
  "dist/skills/cursor-coworker/SKILL.md",
  "README.md",
  "LICENSE",
  "package.json"
];

function command(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8", shell: executable.endsWith(".cmd") });
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export function validatePackageManifest(pkg, report) {
  const paths = new Set(report.files.map(file => file.path));
  for (const required of requiredFiles) {
    if (!paths.has(required)) throw new Error(`Missing package file: ${required}`);
  }
  const bin = pkg.bin?.["cursor-coworker"];
  if (typeof bin !== "string") throw new Error("Missing cursor-coworker executable declaration");
  if (!paths.has(bin)) throw new Error(`Executable is not packaged: ${bin}`);
}

export function verifyPackage(root = process.cwd()) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const dryRun = JSON.parse(run(command("npm"), ["pack", "--dry-run", "--json", "--ignore-scripts"], root))[0];
  validatePackageManifest(pkg, dryRun);

  const temporary = mkdtempSync(join(tmpdir(), "cursor-coworker-package-"));
  try {
    const packed = JSON.parse(run(
      command("npm"),
      ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
      root
    ))[0];
    const tarball = join(temporary, packed.filename);
    const prefix = join(temporary, "install");
    run(command("npm"), ["install", "--ignore-scripts", "--prefix", prefix, tarball], temporary);

    const project = join(temporary, "project");
    mkdirSync(project);
    const cli = join(prefix, "node_modules", pkg.name, pkg.bin["cursor-coworker"]);
    const output = run(process.execPath, [cli, "install-skill", "codex", "--cwd", project], temporary);
    const result = JSON.parse(output);
    if (!existsSync(result.path)) throw new Error(`Installed skill is missing: ${result.path}`);

    return {
      status: "verified",
      package: pkg.name,
      version: pkg.version,
      files: dryRun.files.length,
      skillInstalled: true
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  try {
    process.stdout.write(`${JSON.stringify(verifyPackage())}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
