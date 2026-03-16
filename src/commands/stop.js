import { Command } from 'commander';
import { green, cyan, bold, dim, symbols } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { removeHost } from '../hosts.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';
import { dropPrivileges } from '../privileges.js';

/**
 * Resolve domain: if it looks like a short name (no dots), append .test.
 */
function resolveDomain(name) {
  if (name.includes('.')) return name;
  return `${name}.test`;
}

const stopCommand = new Command('stop')
  .description('Stop one domain or all domain mappings')
  .argument('[name]', 'Domain to stop (e.g. myapp or myapp.test). Omit to stop all.')
  .action(async (name) => {
    const mappings = getMappings();
    const hostnames = Object.keys(mappings);

    if (hostnames.length === 0) {
      console.log(`\n${symbols.info} No active mappings.\n`);
      return;
    }

    if (name) {
      const domain = resolveDomain(name);
      if (!mappings[domain]) {
        console.error(`${symbols.cross} No mappings found for ${bold(domain)}`);
        process.exit(1);
      }
      console.log(`\n${symbols.arrow} Stopping ${bold(cyan(domain))}\n`);
      delete mappings[domain];
      try {
        removeHost(domain);
        console.log(`  ${symbols.check} Removed hosts entry for ${cyan(domain)}`);
      } catch {
        console.log(`  ${symbols.warn} Could not update /etc/hosts (run with sudo)`);
      }
    } else {
      console.log(`\n${symbols.arrow} Stopping all mappings\n`);
      for (const hostname of hostnames) {
        try {
          removeHost(hostname);
        } catch {}
      }
      for (const h of hostnames) delete mappings[h];
      console.log(`  ${symbols.check} Removed ${hostnames.length} domain(s)`);
    }

    dropPrivileges();
    saveMappings(mappings);
    ensureDaemon();
    reloadDaemon();
    console.log(`  ${symbols.check} Proxy reloaded`);
    console.log(`\n${symbols.check} ${green('Done!')}\n`);
  });

export default stopCommand;
