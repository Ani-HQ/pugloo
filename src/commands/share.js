import { Command } from 'commander';
import { bold, cyan, green, symbols } from '../colors.js';
import { getMappings } from '../store.js';
import { shareDomain, stopSharing } from '../tunnel.js';

const shareCommand = new Command('share')
  .description('Expose a local domain publicly via tunnel')
  .argument('<domain>', 'Domain to share (e.g. myapp.dev)')
  .action(async (domain) => {
    const mappings = getMappings();

    if (!mappings[domain]) {
      console.error(`${symbols.cross} No mapping found for ${bold(domain)}`);
      console.error(`  Run ${bold(`pugloo map ${domain} <port>`)} first.`);
      process.exit(1);
    }

    console.log(`\n${symbols.arrow} Creating tunnel for ${bold(cyan(domain))}...\n`);

    const { publicUrl } = await shareDomain(domain);

    console.log(`  ${symbols.check} Tunnel established!`);
    console.log(`  ${symbols.arrow} Public URL: ${bold(green(publicUrl))}`);
    console.log(`\n  Press ${bold('Ctrl+C')} to stop sharing.\n`);

    // Keep process alive until interrupted
    process.on('SIGINT', () => {
      console.log(`\n${symbols.info} Closing tunnel...`);
      stopSharing(domain);
      console.log(`${symbols.check} Tunnel closed.\n`);
      process.exit(0);
    });
  });

export default shareCommand;
