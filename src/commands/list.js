import { Command } from 'commander';
import { bold, cyan, dim, green, gray, symbols } from '../colors.js';
import { getMappings } from '../store.js';

const listCommand = new Command('list')
  .alias('ls')
  .description('List all active domain mappings')
  .action(async () => {
    const mappings = getMappings();
    const hostnames = Object.keys(mappings);

    if (hostnames.length === 0) {
      console.log(`\n${symbols.info} No active mappings. Use ${bold('pugloo map')} to create one.\n`);
      return;
    }

    console.log(`\n${bold('Active Mappings')}\n`);
    console.log(`  ${gray('DOMAIN'.padEnd(35))} ${gray('TARGET')}`);
    console.log(`  ${gray('-'.repeat(35))} ${gray('-'.repeat(20))}`);

    for (const hostname of hostnames.sort()) {
      const paths = mappings[hostname];
      for (const [pathPrefix, { port }] of Object.entries(paths).sort()) {
        const domain = pathPrefix === '/'
          ? hostname
          : `${hostname}${pathPrefix}`;

        console.log(
          `  ${cyan(domain.padEnd(35))} ${dim('->')} ${green(`localhost:${port}`)}`
        );
      }
    }

    const total = hostnames.reduce(
      (sum, h) => sum + Object.keys(mappings[h]).length,
      0
    );
    console.log(`\n  ${dim(`${total} mapping${total === 1 ? '' : 's'}`)}\n`);
  });

export default listCommand;
