import { Command } from 'commander';
import { green, cyan, bold, dim, symbols } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { addHost } from '../hosts.js';
import { generateDomainCert } from '../certs.js';
import { ensureDaemon, reloadDaemon, startDaemon, isDaemonRunning, getDaemonPid } from '../daemon.js';
import { setupPortForwarding, isPortForwardingActive } from '../ports.js';
import { dropPrivileges } from '../privileges.js';
import { validateHostname } from '../domain.js';
import { detectListeningPorts } from '../detect-ports.js';
import { pickPort } from '../picker.js';

/**
 * Resolve domain: if it looks like a short name (no dots), append .test.
 */
function resolveDomain(name) {
  if (name.includes('.')) return name;
  return `${name}.test`;
}

const startCommand = new Command('start')
  .description('Start a domain mapping or the proxy daemon')
  .argument('[name]', 'Domain name (e.g. myapp or myapp.test). Omit to start daemon only.')
  .option('-p, --port <port>', 'Local port to proxy to')
  .option('-r, --route <path=port>', 'Route path to port (e.g. /api=8080). Can be repeated.', (v, prev) => (prev || []).concat([v]))
  .action(async (name, opts) => {
    if (!name) {
      // Daemon-only start
      if (isDaemonRunning()) {
        console.log(`\n${symbols.info} Daemon already running ${dim(`(pid ${getDaemonPid()})`)}\n`);
        return;
      }
      const pid = startDaemon();
      console.log(`\n${symbols.check} Daemon started ${dim(`(pid ${pid})`)}\n`);
      try {
        if (!isPortForwardingActive()) setupPortForwarding();
      } catch {}
      return;
    }

    const domain = resolveDomain(name);
    const validation = validateHostname(domain);
    if (!validation.valid) {
      console.error(`${symbols.cross} Invalid domain: ${validation.reason}`);
      process.exit(1);
    }
    if (validation.warn) {
      console.log(`  ${symbols.warn} ${validation.warn}`);
    }

    let port = opts.port ? parseInt(opts.port, 10) : null;
    const routes = opts.route || [];

    if (!port && routes.length === 0) {
      // Auto-detect running servers
      const ports = detectListeningPorts();
      if (ports.length === 0) {
        console.error(`${symbols.cross} No listening servers detected.`);
        console.error(`  ${dim('Specify a port:')} pugloo start ${name} --port <port>`);
        process.exit(1);
      }
      if (ports.length === 1) {
        port = ports[0].port;
        console.log(`\n  ${symbols.check} Detected ${bold(ports[0].command)} on port ${bold(green(String(port)))}`);
      } else {
        const choice = await pickPort(ports);
        if (!choice) {
          console.log(`${symbols.info} Cancelled.\n`);
          process.exit(0);
        }
        port = choice.port;
      }
    }

    const pathMap = {};
    if (port) pathMap['/'] = { port };
    for (const r of routes) {
      const eq = r.indexOf('=');
      if (eq === -1) {
        console.error(`${symbols.cross} Invalid route: ${r} (expected path=port)`);
        process.exit(1);
      }
      const path = r.slice(0, eq);
      const p = parseInt(r.slice(eq + 1), 10);
      if (isNaN(p) || p < 1 || p > 65535) {
        console.error(`${symbols.cross} Invalid port in route: ${r}`);
        process.exit(1);
      }
      pathMap[path.startsWith('/') ? path : `/${path}`] = { port: p };
    }

    console.log(`\n${symbols.arrow} Mapping ${bold(cyan(domain))} ${dim('->')} localhost\n`);

    try {
      addHost(domain);
      console.log(`  ${symbols.check} Hosts entry added for ${cyan(domain)}`);
    } catch {
      console.log(`  ${symbols.warn} Could not update /etc/hosts (run with sudo)`);
    }

    try {
      if (!isPortForwardingActive()) setupPortForwarding();
      console.log(`  ${symbols.check} Port forwarding active`);
    } catch {
      console.log(`  ${symbols.warn} Could not set up port forwarding ${dim('(requires sudo)')}`);
    }

    dropPrivileges();

    const mappings = getMappings();
    if (!mappings[domain]) mappings[domain] = {};
    for (const [path, target] of Object.entries(pathMap)) {
      mappings[domain][path] = target;
      const label = path === '/' ? domain : `${domain}${path}`;
      console.log(`  ${symbols.check} ${cyan(label)} ${dim('->')} localhost:${target.port}`);
    }
    saveMappings(mappings);

    try {
      generateDomainCert(domain);
      console.log(`  ${symbols.check} TLS certificate ready`);
    } catch (err) {
      console.error(`  ${symbols.cross} Certificate generation failed: ${err.message}`);
      process.exit(1);
    }

    ensureDaemon();
    reloadDaemon();
    console.log(`  ${symbols.check} Proxy reloaded`);
    console.log(`\n${symbols.check} ${green('Done!')} Visit ${bold(cyan(`https://${domain}`))}\n`);
  });

export default startCommand;
