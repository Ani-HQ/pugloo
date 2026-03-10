import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { bold, yellow, green, dim, cyan, symbols } from '../colors.js';
import { ensureCA, trustCA, untrustCA, getCAPath } from '../certs.js';

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

const trustCommand = new Command('trust')
  .description('Trust the pugloo root CA in your system keychain')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--remove', 'Remove the pugloo root CA from the system trust store')
  .action(async (opts) => {
    if (opts.remove) {
      return handleUntrust(opts);
    }
    return handleTrust(opts);
  });

async function handleTrust(opts) {
  try {
    ensureCA();

    const caPath = getCAPath();

    console.log(`\n${symbols.arrow} Pugloo Root CA`);
    console.log(`  ${symbols.dot} Certificate: ${dim(caPath)}\n`);
    console.log(`  ${symbols.warn} ${yellow('This requires sudo/admin privileges.')}`);
    console.log(`  ${dim('Your system will prompt for your password.')}\n`);

    if (!opts.yes) {
      const ok = await confirm(`  Trust this CA? ${dim('[y/N]')} `);
      if (!ok) {
        console.log(`\n${symbols.info} Aborted.\n`);
        return;
      }
      console.log();
    }

    trustCA();

    console.log(`\n  ${symbols.check} ${green('Root CA trusted successfully!')}`);
    console.log(`  ${symbols.dot} Browsers will now trust pugloo HTTPS certificates.`);
    console.log(`  ${dim('  (You may need to restart your browser for changes to take effect.)')}\n`);
  } catch (err) {
    console.error(`\n  ${symbols.cross} Failed to trust the root CA.`);
    console.error(`  ${dim(err.message)}\n`);
    process.exitCode = 1;
  }
}

async function handleUntrust(opts) {
  try {
    const caPath = getCAPath();

    console.log(`\n${symbols.arrow} Removing Pugloo Root CA from system trust store`);
    console.log(`  ${symbols.dot} Certificate: ${dim(caPath)}\n`);
    console.log(`  ${symbols.warn} ${yellow('This requires sudo/admin privileges.')}`);
    console.log(`  ${dim('Your system will prompt for your password.')}\n`);

    if (!opts.yes) {
      const ok = await confirm(`  Remove trusted CA? ${dim('[y/N]')} `);
      if (!ok) {
        console.log(`\n${symbols.info} Aborted.\n`);
        return;
      }
      console.log();
    }

    untrustCA();

    console.log(`\n  ${symbols.check} ${green('Root CA removed from system trust store.')}`);
    console.log(`  ${symbols.dot} Browsers will no longer trust pugloo HTTPS certificates.\n`);
  } catch (err) {
    console.error(`\n  ${symbols.cross} Failed to remove the root CA from trust store.`);
    console.error(`  ${dim(err.message)}\n`);
    process.exitCode = 1;
  }
}

export default trustCommand;
