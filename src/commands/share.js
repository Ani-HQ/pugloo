import { Command } from 'commander';
import { bold, cyan, green, symbols } from '../colors.js';
import { getMappings } from '../store.js';
import { shareDomain, stopSharing } from '../tunnel.js';

function parseTtl(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return undefined;
  const m = str.trim().match(/^(\d+)(s|m|h|d)?$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  const mult = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] ?? 1);
}

const shareCommand = new Command('share')
  .description('Expose a local domain or port publicly via tunnel')
  .argument('[domain]', 'Domain to share (e.g. myapp.test). Omit when using --port.')
  .option('-p, --port <port>', 'Share localhost:port directly (random subdomain)')
  .option('--subdomain <name>', 'Request a specific subdomain')
  .option('--password <secret>', 'Password-protect the tunnel')
  .option('--ttl <duration>', 'Auto-expire after duration (e.g. 30m, 1h)')
  .option('--domain <name>', 'Custom domain for public URL (requires backend)')
  .action(async (domain, opts) => {
    const port = opts.port ? parseInt(opts.port, 10) : null;

    if (port) {
      if (port < 1 || port > 65535) {
        console.error(`${symbols.cross} Invalid port: ${opts.port}`);
        process.exit(1);
      }
    } else {
      if (!domain) {
        console.error(`${symbols.cross} Specify ${bold('<domain>')} or ${bold('--port')}`);
        process.exit(1);
      }
      const mappings = getMappings();
      if (!mappings[domain]) {
        console.error(`${symbols.cross} No mapping found for ${bold(domain)}`);
        console.error(`  Run ${bold(`pugloo map ${domain} <port>`)} or ${bold(`pugloo start ${domain} --port <port>`)} first.`);
        process.exit(1);
      }
    }

    const label = port ? `localhost:${port}` : domain;
    console.log(`\n${symbols.arrow} Creating tunnel for ${bold(cyan(label))}...\n`);

    const options = {
      port: port || undefined,
      subdomain: opts.subdomain || undefined,
      password: opts.password || undefined,
      ttl: parseTtl(opts.ttl),
      domain: opts.domain || undefined,
    };

    const { publicUrl } = await shareDomain(domain || 'localhost', options);

    console.log(`  ${symbols.check} Tunnel established!`);
    console.log(`  ${symbols.arrow} Public URL: ${bold(green(publicUrl))}`);
    console.log(`\n  Press ${bold('Ctrl+C')} to stop sharing.\n`);

    const key = port ? `port:${port}` : domain;
    process.on('SIGINT', () => {
      console.log(`\n${symbols.info} Closing tunnel...`);
      stopSharing(key);
      console.log(`${symbols.check} Tunnel closed.\n`);
      process.exit(0);
    });
  });

export default shareCommand;
