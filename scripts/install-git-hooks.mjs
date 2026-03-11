import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const hooksDir = execSync("git rev-parse --git-path hooks", { encoding: "utf8", cwd: repoRoot }).trim();
const postCommitPath = `${hooksDir}/post-commit`;

mkdirSync(hooksDir, { recursive: true });

const hookScript = `#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
node scripts/post-commit-clockwork.mjs
`;

writeFileSync(postCommitPath, hookScript, "utf8");
chmodSync(postCommitPath, 0o755);

process.stdout.write("Installed .git/hooks/post-commit for clockwork context sync.\n");
