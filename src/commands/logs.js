import { Command } from 'commander';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const LOG_PATH = join(homedir(), '.pugloo', 'daemon.log');

function filter(line, domain) {
  return !domain || line.includes(domain);
}

const logsCommand = new Command('logs')
  .description('View daemon access logs')
  .option('-f, --follow', 'Tail log file (follow mode)')
  .option('--flush', 'Clear the log file')
  .argument('[domain]', 'Filter logs by domain (optional)')
  .action(async (domain, opts) => {
    if (opts.flush) {
      if (existsSync(LOG_PATH)) {
        createWriteStream(LOG_PATH, { flags: 'w' }).end();
        console.log('Log file cleared.');
      }
      return;
    }

    if (!existsSync(LOG_PATH)) {
      console.log('No log file found. Start the daemon to generate logs.');
      return;
    }

    const stream = createReadStream(LOG_PATH);
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (filter(line, domain)) console.log(line);
    }

    if (opts.follow) {
      let pos = statSync(LOG_PATH).size;
      const poll = () => {
        try {
          const st = statSync(LOG_PATH);
          if (st.size > pos) {
            const tail = createReadStream(LOG_PATH, { start: pos, end: st.size - 1 });
            tail.on('data', (chunk) => {
              for (const line of chunk.toString().split('\n').filter(Boolean)) {
                if (filter(line, domain)) console.log(line);
              }
            });
            pos = st.size;
          }
        } catch {
          // File may have been rotated or removed
        }
      };
      const interval = setInterval(poll, 500);
      process.on('SIGINT', () => {
        clearInterval(interval);
        process.exit(0);
      });
    }
  });

export default logsCommand;
