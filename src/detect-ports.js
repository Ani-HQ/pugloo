import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const EXCLUDED_COMMANDS = [
  'postgres', 'redis-server', 'ControlCenter', 'rapportd',
  'Spotify', 'Discord', 'Dropbox', 'Google', 'Microsoft',
  'com.apple', 'mDNSResponder', 'launchd', 'mysqld', 'mongod',
  'dockerd', 'containerd', 'systemd', 'sshd', 'httpd', 'nginx',
  'Raycast', 'Linear', 'figma', 'Slack', 'zoom', 'Teams',
  'Electron', 'Brave', 'Chrome', 'Firefox', 'Safari', 'Arc',
  'stable', '1Password', 'Bitwarden', 'iTerm', 'Terminal',
  'Superhuman', 'Notion', 'Obsidian', 'Cursor', 'Code Helper',
];

const COMMON_DEV_PORTS = [3000, 3001, 4000, 4200, 5000, 5173, 5174, 8000, 8080, 8888, 9000];

function isExcluded(command) {
  return EXCLUDED_COMMANDS.some((ex) => command.toLowerCase().includes(ex.toLowerCase()));
}

function parseLsofOutput(output) {
  const entries = [];
  let currentPid = null;
  let currentCommand = null;

  for (const line of output.split('\n')) {
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);

    if (tag === 'p') {
      currentPid = parseInt(value, 10);
      currentCommand = null;
    } else if (tag === 'c') {
      currentCommand = value;
    } else if (tag === 'n') {
      const match = value.match(/:(\d+)$/);
      if (match) {
        const port = parseInt(match[1], 10);
        if (port >= 1024 && port <= 65535 && currentCommand && !isExcluded(currentCommand)) {
          entries.push({ port, pid: currentPid, command: currentCommand });
        }
      }
    }
  }

  return entries;
}

function parseSsOutput(output) {
  const entries = [];

  for (const line of output.split('\n')) {
    if (!line.startsWith('LISTEN')) continue;
    const parts = line.split(/\s+/);
    const local = parts[3] || '';
    const portMatch = local.match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = parseInt(portMatch[1], 10);
    if (port < 1024 || port > 65535) continue;

    const usersField = parts[5] || '';
    const pidMatch = usersField.match(/pid=(\d+)/);
    const cmdMatch = usersField.match(/\("([^"]+)"/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
    const command = cmdMatch ? cmdMatch[1] : 'unknown';

    if (!isExcluded(command)) {
      entries.push({ port, pid, command });
    }
  }

  return entries;
}

function deduplicate(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    if (seen.has(e.port)) return false;
    seen.add(e.port);
    return true;
  });
}

function sortEntries(entries) {
  const devPortIndex = new Map(COMMON_DEV_PORTS.map((p, i) => [p, i]));
  return entries.sort((a, b) => {
    const aIdx = devPortIndex.has(a.port) ? devPortIndex.get(a.port) : Infinity;
    const bIdx = devPortIndex.has(b.port) ? devPortIndex.get(b.port) : Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.port - b.port;
  });
}

/**
 * Detect TCP servers listening on localhost.
 * Returns an array of { port, pid, command } sorted by dev relevance.
 */
export function detectListeningPorts() {
  try {
    const output = execSync('lsof -iTCP -sTCP:LISTEN -P -n -F pcn', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return sortEntries(deduplicate(parseLsofOutput(output)));
  } catch {
    // lsof failed; try ss on Linux
    if (platform() === 'linux') {
      try {
        const output = execSync('ss -tlnp', {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return sortEntries(deduplicate(parseSsOutput(output)));
      } catch {
        return [];
      }
    }
    return [];
  }
}
