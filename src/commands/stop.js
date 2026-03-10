import { Command } from 'commander';
import { bold, green, red, dim, symbols } from '../colors.js';
import { stopDaemon, isDaemonRunning, getDaemonPid } from '../daemon.js';

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

    console.log(`  ${symbols.check} ${green('Daemon stopped.')}\n`);
  });

export default stopCommand;
