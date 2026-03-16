#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { program } from 'commander';
import mapCommand from '../src/commands/map.js';
import unmapCommand from '../src/commands/unmap.js';
import upCommand from '../src/commands/up.js';
import downCommand from '../src/commands/down.js';
import listCommand from '../src/commands/list.js';
import shareCommand from '../src/commands/share.js';
import statusCommand from '../src/commands/status.js';
import startCommand from '../src/commands/start.js';
import stopCommand from '../src/commands/stop.js';
import trustCommand from '../src/commands/trust.js';
import daemonCommand from '../src/commands/daemon.js';
import logsCommand from '../src/commands/logs.js';
import doctorCommand from '../src/commands/doctor.js';
import updateCommand from '../src/commands/update.js';
import uninstallCommand from '../src/commands/uninstall.js';
import loginCommand from '../src/commands/login.js';
import { banner, art } from '../src/colors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .name('pugloo')
  .description(banner())
  .version(pkg.version)
  .action(() => {
    console.log(art());
    program.help();
  });

program.addCommand(mapCommand);
program.addCommand(unmapCommand);
program.addCommand(upCommand);
program.addCommand(downCommand);
program.addCommand(listCommand);
program.addCommand(shareCommand);
program.addCommand(statusCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(trustCommand);
program.addCommand(daemonCommand);
program.addCommand(logsCommand);
program.addCommand(doctorCommand);
program.addCommand(updateCommand);
program.addCommand(uninstallCommand);
program.addCommand(loginCommand);

program.parse();
