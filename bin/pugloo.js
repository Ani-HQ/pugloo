#!/usr/bin/env node

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
import { banner, art } from '../src/colors.js';

program
  .name('pugloo')
  .description(banner())
  .version('0.1.0')
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

program.parse();
