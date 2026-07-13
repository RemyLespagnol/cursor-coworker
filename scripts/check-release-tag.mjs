import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertReleaseTag(tag, version) {
  if (tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match package version ${version}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
    assertReleaseTag(tag, pkg.version);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
