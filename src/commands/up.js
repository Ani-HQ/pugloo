import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { green, cyan, bold, dim, symbols } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { addHost } from '../hosts.js';
import { generateDomainCert } from '../certs.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';
import { setupPortForwarding, isPortForwardingActive } from '../ports.js';
import { dropPrivileges } from '../privileges.js';
import { validateHostname } from '../domain.js';

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

    const validation = validateHostname(domain);
    if (!validation.valid) {
      console.error(`${symbols.cross} Invalid domain ${bold(domain)}: ${validation.reason}`);
      process.exit(1);
    }

    console.log(`\n${symbols.arrow} Starting ${bold(cyan(domain))} services\n`);

    // --- Privileged operations (need root) ---
    addHost(domain);
    console.log(`  ${symbols.check} Hosts entry added for ${cyan(domain)}`);

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
