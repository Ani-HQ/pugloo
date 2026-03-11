/**
 * Validate a hostname for local mapping usage.
 * Allows common hostnames like "myapp.dev", "foo.local", and "localhost".
 */
export function validateHostname(hostname) {
  if (typeof hostname !== "string" || hostname.length === 0) {
    return { valid: false, reason: "Domain cannot be empty." };
  }

  if (hostname.length > 253) {
    return { valid: false, reason: "Domain is too long (max 253 chars)." };
  }

  if (/\s/.test(hostname)) {
    return { valid: false, reason: "Domain cannot contain spaces." };
  }

  if (hostname.startsWith(".") || hostname.endsWith(".")) {
    return { valid: false, reason: "Domain cannot start or end with a dot." };
  }

  const labels = hostname.split(".");
  for (const label of labels) {
    if (label.length === 0) {
      return { valid: false, reason: "Domain cannot contain empty labels." };
    }
    if (label.length > 63) {
      return { valid: false, reason: "Each domain label must be 63 chars or less." };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(label)) {
      return { valid: false, reason: "Domain can only contain letters, numbers, hyphens, and dots." };
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return { valid: false, reason: "Domain labels cannot start or end with a hyphen." };
    }
  }

  return { valid: true };
}
