import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const assets = [
  ["bench/cases.readonly.json", "dist/bench/cases.readonly.json"],
  ["skills/cursor-coworker/SKILL.md", "dist/skills/cursor-coworker/SKILL.md"]
];

for (const [source, destination] of assets) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
