/**
 * The pugloo error contract. Under --json, stdout carries exactly one JSON
 * object (result or error) and the process exits with the documented code.
 * Human-facing color output goes to stderr so agents can always parse stdout.
 */

export const ERR = {
  INTERNAL: { code: 1, name: "PUGLOO_ERR_INTERNAL" },
  NO_PORT: { code: 3, name: "PUGLOO_ERR_NO_PORT" },
  PORT_CLOSED: { code: 4, name: "PUGLOO_ERR_PORT_CLOSED" },
  GATEWAY: { code: 5, name: "PUGLOO_ERR_GATEWAY" },
  DAEMON: { code: 6, name: "PUGLOO_ERR_DAEMON" },
  SUBDOMAIN: { code: 7, name: "PUGLOO_ERR_SUBDOMAIN" },
  AUTH: { code: 8, name: "PUGLOO_ERR_AUTH" },
  POLICY: { code: 9, name: "PUGLOO_ERR_POLICY" },
};

/**
 * Emit an error per the contract and exit. `extra` merges into the JSON
 * error object (e.g. { candidates: [...] }).
 */
export function fail(json, err, message, hint, extra = {}) {
  if (json) {
    process.stdout.write(
      JSON.stringify({ schema: 1, error: err.name, message, hint, ...extra }) + "\n",
    );
  } else {
    process.stderr.write(`✗ ${message}\n`);
    if (hint) process.stderr.write(`  ${hint}\n`);
  }
  process.exit(err.code);
}
