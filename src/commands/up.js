import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { green, cyan, bold, dim, symbols } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { addHost } from '../hosts.js';
import { generateDomainCert } from '../certs.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';

const upCommand = new Command('up')
  .description('Start services defined in .pugloo.yaml')
  .option('--no-commands', 'Skip running service commands')
  .action(async (opts) => {
    const configPath = resolve(process.cwd(), '.pugloo.yaml');
    let raw;

    try {
      raw = await readFile(configPath, 'utf-8');
    } catch {
      console.error(`${symbols.cross} No ${bold('.pugloo.yaml')} found in current directory`);
      process.exit(1);
    }

    const config = yaml.load(raw);

    if (!config?.domain || !config?.services) {
      console.error(`${symbols.cross} Invalid .pugloo.yaml: missing ${bold('domain')} or ${bold('services')}`);
      process.exit(1);
    }

    const { domain, services } = config;

    if (!domain.endsWith('.test')) {
      console.error(`${symbols.cross} Domain must end with ${bold('.test')}`);
      process.exit(1);
    }

    console.log(`\n${symbols.arrow} Starting ${bold(cyan(domain))} services\n`);

    // Add hosts entry and certs for the base domain
    addHost(domain);
    console.log(`  ${symbols.check} Hosts entry added for ${cyan(domain)}`);

    generateDomainCert(domain);
    console.log(`  ${symbols.check} TLS certificate ready`);

    // Set up all path mappings
    const mappings = getMappings();
    mappings[domain] = {};

    for (const [pathPrefix, service] of Object.entries(services)) {
      const port = parseInt(service.port, 10);
      mappings[domain][pathPrefix] = { port };

      const label = pathPrefix === '/' ? domain : `${domain}${pathPrefix}`;
      console.log(`  ${symbols.check} ${cyan(label)} ${dim('->')} localhost:${port}`);
    }

    saveMappings(mappings);
    ensureDaemon();
    reloadDaemon();
    console.log(`  ${symbols.check} Proxy reloaded`);

    console.log(`\n${symbols.check} ${green('All services up!')} Visit ${bold(cyan(`https://${domain}`))}\n`);
  });

export default upCommand;
