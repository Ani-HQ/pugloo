import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { green, symbols } from '../colors.js';

const updateCommand = new Command('update')
  .description('Update pugloo to the latest version')
  .action(async () => {
    console.log('\n  Updating pugloo...\n');

    try {
      execSync('npm install -g pugloo@latest', { stdio: 'inherit' });
      console.log(`\n  ${symbols.check} ${green('Updated to latest version!')}\n`);
    } catch {
      console.error('\n  Update failed. Try: npm install -g pugloo@latest\n');
      process.exit(1);
    }
  });

export default updateCommand;
