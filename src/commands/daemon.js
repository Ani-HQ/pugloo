import { Command } from 'commander';
import { bold, green, cyan, dim, symbols } from '../colors.js';
import { startDaemon, stopDaemon, isDaemonRunning, getDaemonPid } from '../daemon.js';
import { setupPortForwarding, isPortForwardingActive } from '../ports.js';
import { removePortForwarding } from '../ports.js';

const daemonStart = new Command('start')
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

const daemonStop = new Command('stop')
  .description('Stop the pugloo proxy daemon')
  .action(() => {
    if (!isDaemonRunning()) {
      console.log(`\n${symbols.info} Daemon is not running.\n`);
      return;
    }

    const pid = getDaemonPid();
    console.log(`\n${symbols.arrow} Stopping daemon ${dim(`(pid ${pid})`)}...\n`);

    stopDaemon();
    console.log(`  ${symbols.check} Daemon stopped`);

    try {
      removePortForwarding();
      console.log(`  ${symbols.check} Port forwarding removed`);
    } catch {
      console.log(`  ${symbols.warn} Could not remove port forwarding ${dim('(requires sudo)')}`);
    }

    console.log('');
  });

const daemonCommand = new Command('daemon')
  .description('Control the pugloo proxy daemon')
  .addCommand(daemonStart)
  .addCommand(daemonStop);

export default daemonCommand;
