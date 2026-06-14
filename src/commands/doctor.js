import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import forge from 'node-forge';
import { green, yellow, red, dim, symbols } from '../colors.js';
import { isDaemonRunning, getDaemonPid } from '../daemon.js';
import { getMappings } from '../store.js';
import { isPortForwardingActive } from '../ports.js';
import { getCAPath, getCertPaths } from '../certs.js';

const PUGLOO_DIR = join(homedir(), '.pugloo');

function getCertExpiry(certPath) {
  if (!existsSync(certPath)) return null;
  try {
    const pem = readFileSync(certPath, 'utf-8');
    const cert = forge.pki.certificateFromPem(pem);
    return cert.validity.notAfter;
  } catch {
    return null;
  }
}

const doctorCommand = new Command('doctor')
  .description('Run diagnostic checks')
  .action(() => {
    console.log('\n  pugloo doctor\n');

    // CA certificate
    const caPath = getCAPath();
    if (existsSync(caPath)) {
      const expiry = getCertExpiry(caPath);
      const ok = expiry && expiry > new Date();
      const status = ok ? green('valid') : yellow('expired or invalid');
      const expStr = expiry ? `, expires ${expiry.toISOString().slice(0, 10)}` : '';
      console.log(`  ${ok ? symbols.check : symbols.warn}  CA certificate        ${status}${dim(expStr)}`);
    } else {
      console.log(`  ${symbols.cross}  CA certificate        ${red('not found')} (run pugloo trust)`);
    }

    // CA trust - we can't easily verify; assume OK if CA exists
    if (existsSync(caPath)) {
      console.log(`  ${symbols.check}  CA trust              ${dim('assumed trusted')} (run pugloo trust if needed)`);
    }

    // Port forwarding
    const pfActive = isPortForwardingActive();
    console.log(`  ${pfActive ? symbols.check : symbols.cross}  Port forwarding       ${pfActive ? green('active') + dim(' (80→10080, 443→10443)') : yellow('not active')}`);

    // Hosts / mappings
    const mappings = getMappings();
    const hostnames = Object.keys(mappings);
    if (hostnames.length > 0) {
      console.log(`  ${symbols.check}  Hosts                ${green('present')} ${dim(`(${hostnames.join(', ')})`)}`);
    } else {
      console.log(`  ${symbols.dot}  Hosts                ${dim('no mappings')}`);
    }

    // Daemon
    const running = isDaemonRunning();
    console.log(`  ${running ? symbols.check : symbols.warn}  Daemon                ${running ? green('running') + dim(` (pid ${getDaemonPid()})`) : yellow('not running')}`);

    // Per-domain certs
    for (const hostname of hostnames) {
      try {
        const paths = getCertPaths(hostname);
        const expiry = getCertExpiry(paths.cert);
        const ok = expiry && expiry > new Date();
        const expStr = expiry ? expiry.toISOString().slice(0, 10) : '?';
        console.log(`  ${ok ? symbols.check : symbols.warn}  Cert: ${hostname.padEnd(12)} ${ok ? green('valid') : yellow('invalid')}${dim(`, expires ${expStr}`)}`);
      } catch {
        console.log(`  ${symbols.cross}  Cert: ${hostname.padEnd(12)} ${red('missing')}`);
      }
    }

    console.log('');
  });

export default doctorCommand;
