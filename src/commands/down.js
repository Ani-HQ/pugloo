import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { green, cyan, bold, symbols } from '../colors.js';
import { getMappings, saveMappings } from '../store.js';
import { removeHost } from '../hosts.js';
import { ensureDaemon, reloadDaemon } from '../daemon.js';

const downCommand = new Command('down')
  .description('Stop services defined in .pugloo.yaml')
  .action(async () => {
    const configPath = resolve(process.cwd(), '.pugloo.yaml');
    let raw;

    try {
      raw = await readFile(configPath, 'utf-8');
    } catch {
      console.error(`${symbols.cross} No ${bold('.pugloo.yaml')} found in current directory`);
      process.exit(1);
    }

    const config = yaml.load(raw);

    if (!config?.domain) {
      console.error(`${symbols.cross} Invalid .pugloo.yaml: missing ${bold('domain')}`);
      process.exit(1);
    }

    const { domain } = config;

    console.log(`\n${symbols.arrow} Stopping ${bold(cyan(domain))} services\n`);

    // Remove mappings
    const mappings = getMappings();
    delete mappings[domain];
    saveMappings(mappings);
    console.log(`  ${symbols.check} Mappings removed`);

    // Clean up hosts
    removeHost(domain);
    console.log(`  ${symbols.check} Hosts entry removed`);

    ensureDaemon();
    reloadDaemon();
    console.log(`  ${symbols.check} Proxy reloaded`);

    console.log(`\n${symbols.check} ${green('All services stopped!')}\n`);
  });

export default downCommand;
