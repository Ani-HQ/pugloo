import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { generateKeyPairSync, createPublicKey, createHash } from "node:crypto";
import { getStorePath } from "./store.js";

/**
 * Anonymous-first identity. On first use an ed25519 keypair is generated at
 * ~/.pugloo/identity (PEM, 0600). The owner id used for subdomain derivation
 * comes from the account token when PUGLOO_TOKEN is set (so ephemeral
 * sandboxes get stable URLs), falling back to the local public key.
 */

function identityPath() {
  return getStorePath("identity");
}

function loadOrCreatePrivateKeyPem() {
  const file = identityPath();
  if (existsSync(file)) {
    return readFileSync(file, "utf-8");
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  writeFileSync(file, pem, { mode: 0o600 });
  chmodSync(file, 0o600);
  return pem;
}

/**
 * Stable fingerprint of the local public key (hex sha256 of the SPKI DER).
 */
export function localKeyFingerprint() {
  const pem = loadOrCreatePrivateKeyPem();
  const pub = createPublicKey(pem);
  const der = pub.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

/**
 * Returns { ownerId, stability }. stability is "account" when PUGLOO_TOKEN
 * is set (URL survives fresh machines/sandboxes) and "machine" otherwise.
 */
export function getOwner(env = process.env) {
  const token = env.PUGLOO_TOKEN;
  if (token && token.trim()) {
    const id = createHash("sha256").update(token.trim()).digest("hex");
    return { ownerId: `tok:${id}`, stability: "account" };
  }
  return { ownerId: `key:${localKeyFingerprint()}`, stability: "machine" };
}
