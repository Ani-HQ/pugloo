import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { green, yellow, dim, symbols } from '../colors.js';
import { getMappings } from '../store.js';
import { removeHost } from '../hosts.js';
import { removePortForwarding } from '../ports.js';
import { stopDaemon, isDaemonRunning } from '../daemon.js';
import { untrustCA, getCAPath } from '../certs.js';

const PUGLOO_DIR = join(homedir(), '.pugloo');

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

const uninstallCommand = new Command('uninstall')
  .description('Remove pugloo: CA, certs, hosts entries, port-forward rules, config')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (opts) => {
    console.log('\n  pugloo uninstall\n');
    console.log(`  ${yellow('This will remove:')}`);
    console.log(`    ${dim('•')} Root CA and all domain certificates`);
    console.log(`    ${dim('•')} Hosts file entries for pugloo domains`);
    console.log(`    ${dim('•')} Port forwarding rules (80→10080, 443→10443)`);
    console.log(`    ${dim('•')} All mappings and ~/.pugloo/ directory\n`);

    if (!opts.yes) {
      const ok = await confirm(`  Remove everything? ${dim('[y/N]')} `);
      if (!ok) {
        console.log('\n  Aborted.\n');
        return;
      }
      console.log();
    }

    // Stop daemon
    if (isDaemonRunning()) {
      stopDaemon();
      console.log(`  ${symbols.check} Daemon stopped`);
    }

    // Remove port forwarding
    try {
      removePortForwarding();
      console.log(`  ${symbols.check} Port forwarding removed`);
    } catch {
      console.log(`  ${symbols.warn} Could not remove port forwarding (run with sudo)`);
    }

    // Remove hosts entries for all mapped domains
    const mappings = getMappings();
    for (const hostname of Object.keys(mappings)) {
      try {
        removeHost(hostname);
      } catch {}
    }
    if (Object.keys(mappings).length > 0) {
      console.log(`  ${symbols.check} Hosts entries removed`);
    }

    // Remove CA from system trust
    if (existsSync(getCAPath())) {
      try {
        untrustCA();
        console.log(`  ${symbols.check} CA removed from system trust store`);
      } catch {
        console.log(`  ${symbols.warn} Could not remove CA from trust store (run with sudo)`);
      }
    }

    // Remove ~/.pugloo
    if (existsSync(PUGLOO_DIR)) {
      rmSync(PUGLOO_DIR, { recursive: true });
      console.log(`  ${symbols.check} Removed ~/.pugloo/`);
    }

    console.log(`\n  ${symbols.check} ${green('Uninstall complete.')}\n`);
  });

export default uninstallCommand;
