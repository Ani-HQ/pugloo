import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { bold, green, dim, symbols } from '../colors.js';

const ENV_PATH = join(homedir(), '.pugloo', 'preview.env');

/**
 * Upsert an `export KEY=value` line in ~/.pugloo/preview.env without disturbing
 * the other lines.
 */
function upsertEnv(key, value) {
  let lines = [];
  if (existsSync(ENV_PATH)) {
    lines = readFileSync(ENV_PATH, 'utf-8').split('\n');
  }
  const re = new RegExp(`^(export\\s+)?${key}=`);
  const entry = `export ${key}=${value}`;
  let found = false;
  lines = lines.map((l) => {
    if (re.test(l.trim())) {
      found = true;
      return entry;
    }
    return l;
  });
  if (!found) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.splice(lines.length ? lines.length - 1 : 0, 0, entry);
  }
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
  chmodSync(ENV_PATH, 0o600);
}

const loginCommand = new Command('login')
  .description('Save your pugloo account token for hosted previews')
  .option('--token <token>', 'Account token (pgl_...) to save')
  .action(async (opts) => {
    if (opts.token) {
      if (!/^pgl_[a-f0-9]+$/i.test(opts.token)) {
        console.error(`${symbols.cross} That doesn't look like a pugloo token (expected pgl_...).`);
        process.exit(8);
      }
      upsertEnv('PUGLOO_TOKEN', opts.token);
      console.log(`\n  ${symbols.check} Saved token to ${bold('~/.pugloo/preview.env')}.`);
      console.log(`  ${dim('Your previews now run on your account tier with stable URLs.')}\n`);
      return;
    }
    console.log(`\n  ${bold('pugloo login')}\n`);
    console.log(`  Get a token, then run: ${bold('pugloo login --token pgl_...')}`);
    console.log(`  ${dim('Without a token, previews use the free anonymous tier.')}`);
    console.log(`  ${dim('GitHub sign-in at https://pugloo.ani.computer/signup (coming soon).')}\n`);
  });

export default loginCommand;
