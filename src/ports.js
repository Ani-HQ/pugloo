import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PUGLOO_DIR = join(homedir(), ".pugloo");
const PF_CONF = join(PUGLOO_DIR, "pf.conf");

const PF_RULES = `rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 80 -> 127.0.0.1 port 10080
rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 443 -> 127.0.0.1 port 10443
`;

const IPTABLES_RULES = [
  { from: 80, to: 10080 },
  { from: 443, to: 10443 },
];

function ensureDir() {
  mkdirSync(PUGLOO_DIR, { recursive: true });
}

const sudo = process.getuid() === 0 ? "" : "sudo ";

// --- macOS (pfctl) ---

function setupPf() {
  ensureDir();
  writeFileSync(PF_CONF, PF_RULES, "utf-8");
  execSync(`${sudo}pfctl -ef ${PF_CONF}`, { stdio: "inherit" });
}

function removePf() {
  try {
    execSync(`${sudo}pfctl -F all -f /etc/pf.conf`, { stdio: "inherit" });
  } catch {
    // pf may not have been active
  }
}

function isPfActive() {
  try {
    const output = execSync(`pfctl -s rules 2>/dev/null`, {
      encoding: "utf-8",
    });
    return output.includes("10080") || output.includes("10443");
  } catch {
    return false;
  }
}

// --- Linux (iptables) ---

function iptablesCmd(action, from, to) {
  return `${sudo}iptables -t nat ${action} OUTPUT -p tcp --dport ${from} -j REDIRECT --to-port ${to}`;
}

function setupIptables() {
  for (const { from, to } of IPTABLES_RULES) {
    execSync(iptablesCmd("-A", from, to), { stdio: "inherit" });
  }
}

function removeIptables() {
  for (const { from, to } of IPTABLES_RULES) {
    try {
      execSync(iptablesCmd("-D", from, to), { stdio: "inherit" });
    } catch {
      // rule may not exist
    }
  }
}

function isIptablesActive() {
  try {
    const output = execSync(`iptables -t nat -L OUTPUT -n 2>/dev/null`, {
      encoding: "utf-8",
    });
    return output.includes("10080") || output.includes("10443");
  } catch {
    return false;
  }
}

// --- Public API ---

const isMac = process.platform === "darwin";

/**
 * Set up port forwarding: 80 -> 10080, 443 -> 10443.
 * Uses pfctl on macOS, iptables on Linux.
 * Will prompt for sudo password if not already root.
 */
export function setupPortForwarding() {
  if (isMac) {
    setupPf();
  } else {
    setupIptables();
  }
}

/**
 * Remove port forwarding rules.
 */
export function removePortForwarding() {
  if (isMac) {
    removePf();
  } else {
    removeIptables();
  }
}

/**
 * Check if port forwarding rules are currently active.
 */
export function isPortForwardingActive() {
  if (isMac) {
    return isPfActive();
  } else {
    return isIptablesActive();
  }
}
