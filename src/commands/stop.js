import { Command } from 'commander';
import { bold, green, red, dim, symbols } from '../colors.js';
import { stopDaemon, isDaemonRunning, getDaemonPid } from '../daemon.js';
import { removePortForwarding } from '../ports.js';

const stopCommand = new Command('stop')
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

export default stopCommand;
