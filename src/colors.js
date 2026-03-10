const esc = (code) => `\x1b[${code}m`;
const reset = esc(0);

const wrap = (code) => (text) => `${esc(code)}${text}${reset}`;

export const bold = wrap(1);
export const dim = wrap(2);
export const green = wrap(32);
export const yellow = wrap(33);
export const blue = wrap(34);
export const magenta = wrap(35);
export const cyan = wrap(36);
export const red = wrap(31);
export const white = wrap(37);
export const gray = wrap(90);

export const symbols = {
  check: green('\u2714'),
  cross: red('\u2718'),
  arrow: cyan('\u279c'),
  dot: gray('\u25cf'),
  info: blue('\u2139'),
  warn: yellow('\u26a0'),
};

export function banner() {
  return bold(magenta('pugloo')) + dim(' - local HTTPS dev proxy');
}

export function art() {
  const inner = 31;
  const line = (content) => {
    const padding = inner - content.length;
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return '|' + ' '.repeat(left) + content + ' '.repeat(right) + '|';
  };
  const border = '+' + '-'.repeat(inner) + '+';
  const empty  = '|' + ' '.repeat(inner) + '|';
  const beans  = '+--+ +--+ +--+ +--+';
  const walls  = '|  | |  | |  | |  |';
  const ptop   = '+-------------+';
  const pmid   = '| p u g l o o |';
  const pbot   = '+-------------+';

  const lines = [
    border,
    empty,
    line(beans),
    line(walls),
    line(beans),
    empty,
    line(ptop),
    line(pmid),
    line(pbot),
    empty,
    line('local HTTPS dev proxy'),
    empty,
    border,
  ];
  return '\n' + lines.map(l => cyan(l)).join('\n') + '\n';
}
