import { Command } from 'commander';
import { green, cyan, bold, symbols, dim, yellow } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { removeHost } from '../hosts.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';

const unmapCommand = new Command('unmap')
  .description('Remove a domain mapping')
  .argument('<domain>', 'Domain to unmap (e.g. myapp.test or myapp.test/api)')
  .action(async (domain) => {
    const slashIndex = domain.indexOf('/');
    const hostname = slashIndex === -1 ? domain : domain.slice(0, slashIndex);
    const pathPrefix = slashIndex === -1 ? null : domain.slice(slashIndex);

    const mappings = getMappings();

    if (!mappings[hostname]) {
      console.error(`${symbols.cross} No mappings found for ${bold(hostname)}`);
      process.exit(1);
    }

    console.log(`\n${symbols.arrow} Unmapping ${bold(cyan(domain))}\n`);

    if (pathPrefix) {
      // Remove only the specific path mapping
      delete mappings[hostname][pathPrefix];
      console.log(`  ${symbols.check} Removed path mapping ${dim(pathPrefix)}`);

      // If no paths left, remove the entire hostname
      if (Object.keys(mappings[hostname]).length === 0) {
        delete mappings[hostname];
        try { removeHost(hostname); } catch { console.log(`  ${symbols.warn} Could not update /etc/hosts (run with sudo)`); }
        console.log(`  ${symbols.check} Removed hosts entry for ${cyan(hostname)}`);
      }
    } else {
      // Remove the entire hostname and all its path mappings
      delete mappings[hostname];
      try { removeHost(hostname); } catch { console.log(`  ${symbols.warn} Could not update /etc/hosts (run with sudo)`); }
      console.log(`  ${symbols.check} Removed all mappings for ${cyan(hostname)}`);
      console.log(`  ${symbols.check} Removed hosts entry`);
    }

    saveMappings(mappings);
    ensureDaemon();
    reloadDaemon();
    console.log(`  ${symbols.check} Proxy reloaded`);

    console.log(`\n${symbols.check} ${green('Done!')}\n`);
  });

export default unmapCommand;
