import { Command } from 'commander';
import { bold, green, red, dim, cyan, yellow, symbols } from '../colors.js';
import { isDaemonRunning, getDaemonPid } from '../daemon.js';
import { getMappings } from '../store.js';
import { isPortForwardingActive } from '../ports.js';

const statusCommand = new Command('status')
  .description('Show pugloo daemon status')
  .action(() => {
    const running = isDaemonRunning();
    const pid = getDaemonPid();
    const mappings = getMappings();
    const mappingCount = Object.keys(mappings).reduce(
      (sum, h) => sum + Object.keys(mappings[h]).length,
      0
    );
    const pfActive = isPortForwardingActive();

    console.log(`\n${bold('pugloo status')}\n`);

    if (running) {
      console.log(`  ${symbols.check} Daemon:   ${green('running')} ${dim(`(pid ${pid})`)}`);
      console.log(`  ${symbols.dot} Proxy:    ${cyan('https://localhost:10443')}`);
    } else {
      console.log(`  ${symbols.cross} Daemon:   ${red('stopped')}`);
    }

    if (pfActive) {
      console.log(`  ${symbols.check} Ports:    ${green('forwarding')} ${dim('(443 -> 10443, 80 -> 10080)')}`);
    } else {
      console.log(`  ${symbols.cross} Ports:    ${yellow('not forwarding')}`);
    }

    console.log(`  ${symbols.dot} Mappings: ${bold(String(mappingCount))}`);
    console.log('');
  });

export default statusCommand;
