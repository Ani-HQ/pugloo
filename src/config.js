import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const CONFIG_FILENAME = ".pugloo.yaml";

/**
 * Load and parse the .pugloo.yaml config file from the given directory.
 * Throws if the file does not exist.
 *
 * @param {string} [dir=process.cwd()] - Directory to look for .pugloo.yaml
 * @returns {object} Parsed config object
 */
export function loadConfig(dir) {
  const configDir = dir || process.cwd();
  const configPath = join(configDir, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, "utf-8");
  return yaml.load(content);
}

/**
 * Same as loadConfig but returns null instead of throwing when the
 * config file is not found.
 *
 * @param {string} [dir=process.cwd()] - Directory to look for .pugloo.yaml
 * @returns {object|null} Parsed config object, or null if not found
 */
export function getConfig(dir) {
  try {
    return loadConfig(dir);
  } catch {
    return null;
  }
}
