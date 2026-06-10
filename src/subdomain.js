import { execSync } from "node:child_process";
import { basename } from "node:path";
import { createHash } from "node:crypto";

/**
 * Deterministic preview subdomain derivation.
 *
 * Shape: <base>-<suffix> where base = sanitize(<repo>-<branch>) and suffix is
 * 6 hex chars of sha256(ownerId + "\n" + repoId). The suffix makes the name
 * unique per owner+repo (no cross-user collisions, squatting is pointless)
 * while staying identical across runs, machines (with PUGLOO_TOKEN), and
 * pushes — that is the "consistent preview URL" guarantee.
 */

const MAX_LABEL = 63;
const SUFFIX_LEN = 6;

export function sanitizeLabel(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveSuffix(ownerId, repoId) {
  return createHash("sha256")
    .update(`${ownerId}\n${repoId}`)
    .digest("hex")
    .slice(0, SUFFIX_LEN);
}

/**
 * @param {object} ctx
 * @param {string} ctx.repo     - repo name (git toplevel dirname or cwd dirname)
 * @param {string|null} ctx.branch - branch name, or null when unknown
 * @param {string} ctx.ownerId  - from identity.getOwner()
 * @param {string} ctx.repoId   - normalized remote URL, or path fallback
 * @param {string} [ctx.base]   - explicit override for the base (--name)
 * @returns {string} DNS label, always <= 63 chars
 */
export function deriveSubdomain({ repo, branch, ownerId, repoId, base }) {
  const suffix = deriveSuffix(ownerId, repoId);
  let stem = base
    ? sanitizeLabel(base)
    : sanitizeLabel(branch ? `${repo}-${branch}` : repo);
  if (!stem) stem = "preview";
  const room = MAX_LABEL - SUFFIX_LEN - 1;
  if (stem.length > room) {
    stem = stem.slice(0, room).replace(/-$/, "");
  }
  return `${stem}-${suffix}`;
}

function git(args, cwd) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    timeout: 3000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Collect repo/branch/repoId from the working directory.
 * Fallbacks (per spec): detached HEAD -> PUGLOO_BRANCH env, else short commit
 * hash; no remote -> toplevel path; not a git repo -> cwd dirname/path.
 */
export function gitContext(cwd = process.cwd(), env = process.env) {
  let toplevel;
  try {
    toplevel = git("rev-parse --show-toplevel", cwd);
  } catch {
    return { repo: basename(cwd), branch: null, repoId: cwd, isGit: false };
  }

  let branch = null;
  try {
    const ref = git("rev-parse --abbrev-ref HEAD", cwd);
    if (ref !== "HEAD") {
      branch = ref;
    } else if (env.PUGLOO_BRANCH && env.PUGLOO_BRANCH.trim()) {
      branch = env.PUGLOO_BRANCH.trim();
    } else {
      branch = git("rev-parse --short HEAD", cwd);
    }
  } catch {
    branch = null;
  }

  let repoId;
  try {
    repoId = git("remote get-url origin", cwd).replace(/\.git$/, "");
  } catch {
    repoId = toplevel;
  }

  return { repo: basename(toplevel), branch, repoId, isGit: true };
}
