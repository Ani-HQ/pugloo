import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { bold, green, dim, cyan, symbols } from '../colors.js';

const ENV_PATH = join(homedir(), '.pugloo', 'preview.env');

// Public GitHub OAuth client id for `pugloo login` (client ids are not secret).
// Override with PUGLOO_GITHUB_CLIENT_ID until the shared app is provisioned.
const DEFAULT_CLIENT_ID = '';

function upsertEnv(key, value) {
  let lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8').split('\n') : [];
  const re = new RegExp(`^(export\\s+)?${key}=`);
  const entry = `export ${key}=${value}`;
  let found = false;
  lines = lines.map((l) => (re.test(l.trim()) ? ((found = true), entry) : l));
  if (!found) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.splice(lines.length ? lines.length - 1 : 0, 0, entry);
  }
  writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
  chmodSync(ENV_PATH, 0o600);
}

function readEnvValue(key) {
  if (process.env[key]) return process.env[key];
  if (!existsSync(ENV_PATH)) return undefined;
  for (const l of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const m = l.trim().match(new RegExp(`^(?:export\\s+)?${key}=(.*)$`));
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

function apiBase() {
  if (process.env.PUGLOO_API) return process.env.PUGLOO_API.replace(/\/$/, '');
  // The gateway's apex host serves /auth + /health (Caddy routes them to the
  // control-plane); preview subdomains live under it.
  const domain = readEnvValue('PUGLOO_FRP_DOMAIN');
  return domain ? `https://${domain}` : null;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deviceFlow(clientId) {
  const codeRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'read:user user:email' }),
  }).then((r) => r.json());
  if (!codeRes.device_code) throw new Error('GitHub did not return a device code (check the client id / device-flow enabled)');

  console.log(`\n  Open ${bold(cyan(codeRes.verification_uri))} and enter code: ${bold(green(codeRes.user_code))}\n`);
  openBrowser(codeRes.verification_uri);

  let interval = (codeRes.interval || 5) * 1000;
  const deadline = Date.now() + (codeRes.expires_in || 900) * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const tok = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: codeRes.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    }).then((r) => r.json());
    if (tok.access_token) return tok.access_token;
    if (tok.error === 'authorization_pending') continue;
    if (tok.error === 'slow_down') { interval += 5000; continue; }
    throw new Error(`GitHub device flow failed: ${tok.error || 'unknown'}`);
  }
  throw new Error('Login timed out — run pugloo login again.');
}

const loginCommand = new Command('login')
  .description('Sign in with GitHub (or save a token) for hosted previews')
  .option('--token <token>', 'Save an existing account token (pgl_...) directly')
  .action(async (opts) => {
    if (opts.token) {
      if (!/^pgl_[a-f0-9]+$/i.test(opts.token)) {
        console.error(`${symbols.cross} That doesn't look like a pugloo token (expected pgl_...).`);
        process.exit(8);
      }
      upsertEnv('PUGLOO_TOKEN', opts.token);
      console.log(`\n  ${symbols.check} Saved token to ${bold('~/.pugloo/preview.env')}.\n`);
      return;
    }

    const clientId = process.env.PUGLOO_GITHUB_CLIENT_ID || DEFAULT_CLIENT_ID;
    const base = apiBase();
    if (!clientId || !base) {
      console.log(`\n  ${bold('pugloo login')}\n`);
      console.log(`  GitHub sign-in isn't configured on this machine yet.`);
      console.log(`  ${dim('Sign up at https://pugloo.ani.computer/signup, then:')}`);
      console.log(`  ${bold('pugloo login --token pgl_...')}\n`);
      return;
    }

    try {
      console.log(`\n${symbols.arrow} Signing in with GitHub...`);
      const ghToken = await deviceFlow(clientId);
      const r = await fetch(`${base}/auth/github/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_token: ghToken }),
      });
      if (!r.ok) throw new Error(`exchange failed (${r.status})`);
      const { token, login } = await r.json();
      upsertEnv('PUGLOO_TOKEN', token);
      console.log(`\n  ${symbols.check} Signed in as ${bold(login)}. Token saved to ${bold('~/.pugloo/preview.env')}.`);
      console.log(`  ${dim('Previews now run on your account tier with stable URLs.')}\n`);
    } catch (err) {
      console.error(`${symbols.cross} ${err.message}`);
      process.exit(8);
    }
  });

export default loginCommand;
