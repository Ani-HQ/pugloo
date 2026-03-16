import { cyan, bold, dim, green, gray, symbols } from './colors.js';

const ARROW_UP = '\x1b[A';
const ARROW_DOWN = '\x1b[B';

/**
 * Render the picker UI to stdout.
 */
function render(choices, selected, isFirst) {
  const lines = [];

  if (isFirst) {
    lines.push('');
    lines.push(`  ${bold('Listening servers detected:')}`);
    lines.push('');
  }

  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    const portStr = String(c.port).padEnd(6);
    const label = `${portStr}${c.command} ${dim(`(pid ${c.pid})`)}`;

    if (i === selected) {
      lines.push(`  ${symbols.arrow} ${green(portStr)}${bold(c.command)} ${dim(`(pid ${c.pid})`)}`);
    } else {
      lines.push(`    ${dim(label)}`);
    }
  }

  lines.push('');
  lines.push(`  ${dim('↑↓ select · enter confirm · q cancel')}`);

  return lines;
}

/**
 * Interactive arrow-key port picker.
 * @param {Array<{port: number, pid: number, command: string}>} choices
 * @returns {Promise<{port: number, pid: number, command: string} | null>}
 */
export function pickPort(choices) {
  if (!process.stdin.isTTY || choices.length === 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let selected = 0;
    let rendered = false;
    const totalLines = choices.length + 4; // header + choices + footer

    function draw() {
      const isFirst = !rendered;

      // Move cursor up to overwrite previous render
      if (rendered) {
        process.stdout.write(`\x1b[${totalLines}A`);
      }

      const lines = render(choices, selected, isFirst);
      for (const line of lines) {
        process.stdout.write(`\x1b[2K${line}\n`);
      }

      rendered = true;
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      process.stdin.pause();
    }

    function onData(data) {
      const key = data.toString();

      if (key === ARROW_UP || key === 'k') {
        selected = (selected - 1 + choices.length) % choices.length;
        draw();
      } else if (key === ARROW_DOWN || key === 'j') {
        selected = (selected + 1) % choices.length;
        draw();
      } else if (key === '\r' || key === '\n') {
        cleanup();
        resolve(choices[selected]);
      } else if (key === 'q' || key === '\x03') {
        // q or Ctrl+C
        cleanup();
        console.log('');
        resolve(null);
      }
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);

    draw();
  });
}
