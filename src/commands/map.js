import { Command } from 'commander';
import { green, cyan, bold, symbols, dim } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { addHost } from '../hosts.js';
import { generateDomainCert } from '../certs.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';
import { setupPortForwarding, isPortForwardingActive } from '../ports.js';
import { dropPrivileges } from '../privileges.js';

const mapCommand = new Command('map')
  .description('Map a .test domain to a local port')
  .argument('<domain>', 'Domain to map (e.g. myapp.test or myapp.test/api)')
  .argument('<target>', 'Local port number to proxy to')
  .action(async (domain, target) => {
    const port = parseInt(target, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`${symbols.cross} Invalid port: ${target}`);
      process.exit(1);
    }

    // Split domain into hostname and optional path prefix
    const slashIndex = domain.indexOf('/');
    const hostname = slashIndex === -1 ? domain : domain.slice(0, slashIndex);
    const pathPrefix = slashIndex === -1 ? '/' : domain.slice(slashIndex);

    if (!hostname.endsWith('.test')) {
      console.error(`${symbols.cross} Domain must end with ${bold('.test')} (got ${bold(hostname)})`);
      process.exit(1);
    }

    console.log(`\n${symbols.arrow} Mapping ${bold(cyan(domain))} ${dim('->')} ${bold(green(`localhost:${port}`))}\n`);

    // --- Privileged operations (need root) ---

    // Add hosts entry
    try {
      addHost(hostname);
      console.log(`  ${symbols.check} Hosts entry added for ${cyan(hostname)}`);
    } catch (err) {
      console.log(`  ${symbols.warn} Could not update /etc/hosts (run with sudo)`);
      console.log(`    ${dim('Add manually:')} 127.0.0.1 ${hostname} # pugloo`);
    }

    // Ensure port forwarding
    try {
      if (!isPortForwardingActive()) {
        setupPortForwarding();
      }
      console.log(`  ${symbols.check} Port forwarding active`);
    } catch {
      console.log(`  ${symbols.warn} Could not set up port forwarding ${dim('(requires sudo)')}`);
    }

    // --- Drop root privileges for remaining file operations ---
    dropPrivileges();

    // Save the mapping
    const mappings = getMappings();
    if (!mappings[hostname]) {
      mappings[hostname] = {};
    }
    mappings[hostname][pathPrefix] = { port };
    saveMappings(mappings);
    console.log(`  ${symbols.check} Mapping saved`);

    // Generate TLS certs for the domain
    try {
      generateDomainCert(hostname);
      console.log(`  ${symbols.check} TLS certificate ready`);
    } catch (err) {
      console.error(`  ${symbols.cross} Certificate generation failed: ${err.message}`);
      process.exit(1);
    }

    // Start or reload the proxy daemon
    try {
      ensureDaemon();
      reloadDaemon();
      console.log(`  ${symbols.check} Proxy reloaded`);
    } catch (err) {
      console.log(`  ${symbols.warn} Could not reload proxy: ${err.message}`);
    }

    console.log(`\n${symbols.check} ${green('Done!')} Visit ${bold(cyan(`https://${domain}`))}\n`);
  });

export default mapCommand;
