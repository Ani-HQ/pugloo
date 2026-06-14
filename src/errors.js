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
 * Carries an ERR entry (code + name), a human hint, and optional extra fields
 * for the JSON error object. Shared by the preview engine and the policy guard
 * so callers can handle every failure with one `instanceof` check and map it to
 * the documented exit code.
 */
export class PreviewError extends Error {
  constructor(errInfo, message, hint, extra = {}) {
    super(message);
    this.name = "PreviewError";
    this.errInfo = errInfo; // { code, name } from ERR
    this.hint = hint;
    this.extra = extra;
  }
  toJSON() {
    return { schema: 1, error: this.errInfo.name, message: this.message, hint: this.hint, ...this.extra };
  }
}
