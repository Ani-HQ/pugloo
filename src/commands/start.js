import { Command } from 'commander';
import { bold, green, cyan, dim, symbols } from '../colors.js';
import { startDaemon, isDaemonRunning, getDaemonPid } from '../daemon.js';
import { setupPortForwarding, isPortForwardingActive } from '../ports.js';
const startCommand = new Command('start')
  .description('Start the pugloo proxy daemon')
  .action(() => {
    if (isDaemonRunning()) {
      const existingPid = getDaemonPid();
      console.log(`\n${symbols.info} Daemon already running ${dim(`(pid ${existingPid})`)}\n`);
      return;
    }

    console.log(`\n${symbols.arrow} Starting pugloo daemon...\n`);

    const pid = startDaemon();
    console.log(`  ${symbols.check} Daemon started ${dim(`(pid ${pid})`)}`);
    console.log(`  ${symbols.dot} Proxy listening on ${bold(cyan('https://localhost:10443'))}`);

    // Set up port forwarding so 443/80 reach the proxy on 10443/10080.
    try {
      if (!isPortForwardingActive()) {
        setupPortForwarding();
      }
      console.log(`  ${symbols.check} Port forwarding active ${dim('(443 → 10443, 80 → 10080)')}`);
    } catch {
      console.log(`  ${symbols.warn} Could not set up port forwarding ${dim('(requires sudo)')}`);
    }

    console.log(`\n${symbols.check} ${green('Ready!')}\n`);
  });

export default startCommand;
