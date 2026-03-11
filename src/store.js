import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const PUGLOO_DIR = join(homedir(), ".pugloo");
const MAPPINGS_FILE = join(PUGLOO_DIR, "mappings.json");

/**
 * Returns an absolute path under ~/.pugloo/, creating intermediate
 * directories as needed.
 */
export function getStorePath(...parts) {
  const full = join(PUGLOO_DIR, ...parts);
  mkdirSync(dirname(full), { recursive: true });
  return full;
}

/**
 * Read and return the current mappings from ~/.pugloo/mappings.json.
 * Returns an empty object if the file does not exist.
 */
export function getMappings() {
  if (!existsSync(MAPPINGS_FILE)) {
    return {};
  }
  return JSON.parse(readFileSync(MAPPINGS_FILE, "utf-8"));
}

/**
 * Write the mappings object to ~/.pugloo/mappings.json.
 */
export function saveMappings(mappings) {
  mkdirSync(PUGLOO_DIR, { recursive: true });
  writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2), "utf-8");
}

/**
 * Add a single mapping entry.
 *
 * @param {string} domain - The domain name (e.g. "myapp.dev")
 * @param {string} path - The URL path (e.g. "/" or "/api")
 * @param {*} target - The target value (port number, config object, etc.)
 */
export function addMapping(domain, path, target) {
  const mappings = getMappings();
  if (!mappings[domain]) {
    mappings[domain] = {};
  }
  mappings[domain][path] = target;
  saveMappings(mappings);
}

/**
 * Remove a mapping. If no path is specified, remove the entire domain.
 *
 * @param {string} domain
 * @param {string} [path] - Optional path to remove. If omitted, the whole domain is removed.
 */
export function removeMapping(domain, path) {
  const mappings = getMappings();
  if (!mappings[domain]) {
    return;
  }
  if (path === undefined) {
    delete mappings[domain];
  } else {
    delete mappings[domain][path];
    if (Object.keys(mappings[domain]).length === 0) {
      delete mappings[domain];
    }
  }
  saveMappings(mappings);
}

/**
 * Returns the path to the daemon PID file (~/.pugloo/daemon.pid).
 */
export function getPidFile() {
  return getStorePath("daemon.pid");
}
