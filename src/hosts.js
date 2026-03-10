import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOSTS_FILE = "/etc/hosts";
const MARKER = "# pugloo";

/**
 * Parse /etc/hosts and return its lines.
 */
function readHosts() {
  return readFileSync(HOSTS_FILE, "utf-8").split("\n");
}

/**
 * Write lines back to /etc/hosts using a temp file and sudo mv.
 */
function writeHosts(lines) {
  const tmp = join(tmpdir(), `pugloo-hosts-${Date.now()}`);
  writeFileSync(tmp, lines.join("\n"), "utf-8");
  try {
    execSync(`sudo mv ${tmp} ${HOSTS_FILE}`, { stdio: "inherit" });
  } catch {
    try { unlinkSync(tmp); } catch {}
    throw new Error(
      `Failed to update /etc/hosts. Run with sudo or add the entry manually:\n  127.0.0.1 <domain> # pugloo`
    );
  }
}

/**
 * Check if a domain already has an entry in /etc/hosts managed by pugloo.
 */
export function hasHost(domain) {
  const lines = readHosts();
  return lines.some(
    (line) => line.includes(`127.0.0.1`) && line.includes(domain) && line.includes(MARKER)
  );
}

/**
 * Add "127.0.0.1 <domain> # pugloo" to /etc/hosts if not already present.
 */
export function addHost(domain) {
  if (hasHost(domain)) {
    return;
  }
  const lines = readHosts();
  lines.push(`127.0.0.1 ${domain} ${MARKER}`);
  writeHosts(lines);
}

/**
 * Remove the pugloo-managed entry for the given domain from /etc/hosts.
 */
export function removeHost(domain) {
  const lines = readHosts();
  const filtered = lines.filter(
    (line) => !(line.includes(`127.0.0.1`) && line.includes(domain) && line.includes(MARKER))
  );
  if (filtered.length !== lines.length) {
    writeHosts(filtered);
  }
}
