import { Command } from 'commander';
import { dim, symbols } from '../colors.js';

const loginCommand = new Command('login')
  .description('Log in to pugloo (required for share)')
  .action(async () => {
    console.log('\n  pugloo login\n');
    console.log(`  ${dim('Authentication is required to use pugloo share.')}`);
    console.log(`  ${dim('The control-plane service is not yet deployed.')}`);
    console.log(`  ${dim('Run pugloo share without login for local-network tunnels.')}\n`);
    console.log(`  ${symbols.info} Login will be available when the hosted service is deployed.\n`);
  });

export default loginCommand;
