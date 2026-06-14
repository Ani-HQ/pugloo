/**
 * The agent-facing JSON contract for `pugloo preview` (schema version 1).
 * Kept as a pure module so golden tests can pin the shape.
 */

export const PREVIEW_SCHEMA_VERSION = 1;

export const SHARE_HINT =
  "Include this URL in your reply so the reviewer can open it.";

const REQUIRED = ["schema", "url", "expires", "port", "branch", "rebound", "stability", "share_hint"];

/**
 * Build the success payload. Throws if a required field is missing so a
 * contract regression can never ship silently.
 */
export function buildPreviewResult({
  url,
  expires,
  port,
  branch,
  rebound = false,
  stability,
  transport,
  subdomain,
  siblingOf,
  detected,
}) {
  const result = {
    schema: PREVIEW_SCHEMA_VERSION,
    url,
    expires,
    port,
    branch: branch ?? null,
    rebound,
    stability,
    share_hint: SHARE_HINT,
    transport,
    subdomain,
  };
  if (siblingOf) result.sibling_of = siblingOf;
  if (detected) result.detected = true;

  for (const key of REQUIRED) {
    if (result[key] === undefined) {
      throw new Error(`preview contract violation: missing "${key}"`);
    }
  }
  return result;
}
