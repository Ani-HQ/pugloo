import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getStorePath } from "./store.js";

/**
 * Registry of live previews at ~/.pugloo/previews.json. Each entry is owned
 * by a detached runner process; entries whose runner pid is dead are pruned
 * on read. Keyed by id = `${repoId}#${branch}#${subdomain}`.
 */

function registryFile() {
  return getStorePath("previews.json");
}

export function previewId(repoId, branch, subdomain) {
  return `${repoId}#${branch ?? ""}#${subdomain}`;
}

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function loadPreviews({ prune = true } = {}) {
  const file = registryFile();
  let entries = {};
  if (existsSync(file)) {
    try {
      entries = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      entries = {};
    }
  }
  if (!prune) return entries;

  let dirty = false;
  const now = Date.now();
  for (const [id, e] of Object.entries(entries)) {
    const expired = e.expires && Date.parse(e.expires) < now;
    if (expired || (e.status !== "starting" && !isPidAlive(e.pid))) {
      delete entries[id];
      dirty = true;
    }
  }
  if (dirty) savePreviews(entries);
  return entries;
}

export function savePreviews(entries) {
  writeFileSync(registryFile(), JSON.stringify(entries, null, 2), "utf-8");
}

export function upsertPreview(entry) {
  const entries = loadPreviews({ prune: false });
  entries[entry.id] = entry;
  savePreviews(entries);
}

export function removePreview(id) {
  const entries = loadPreviews({ prune: false });
  delete entries[id];
  savePreviews(entries);
}

/**
 * Find live entries for a repo+branch (any subdomain).
 */
export function findByRepoBranch(entries, repoId, branch) {
  const prefix = `${repoId}#${branch ?? ""}#`;
  return Object.values(entries).filter((e) => e.id.startsWith(prefix));
}
