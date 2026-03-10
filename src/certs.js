import forge from "node-forge";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const PUGLOO_DIR = path.join(os.homedir(), ".pugloo");
const CA_DIR = path.join(PUGLOO_DIR, "ca");
const CERTS_DIR = path.join(PUGLOO_DIR, "certs");

const CA_CERT_PATH = path.join(CA_DIR, "rootCA.pem");
const CA_KEY_PATH = path.join(CA_DIR, "rootCA-key.pem");

function createCA() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 10
  );

  const attrs = [
    { name: "commonName", value: "Pugloo Local CA" },
    { name: "organizationName", value: "Pugloo" },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    {
      name: "keyUsage",
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  fs.mkdirSync(CA_DIR, { recursive: true });
  fs.writeFileSync(CA_CERT_PATH, certPem);
  fs.writeFileSync(CA_KEY_PATH, keyPem, { mode: 0o600 });

  return { cert, privateKey: keys.privateKey };
}

function loadCA() {
  const certPem = fs.readFileSync(CA_CERT_PATH, "utf-8");
  const keyPem = fs.readFileSync(CA_KEY_PATH, "utf-8");
  return {
    cert: forge.pki.certificateFromPem(certPem),
    privateKey: forge.pki.privateKeyFromPem(keyPem),
  };
}

function generateSerialNumber() {
  return Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16);
}

/**
 * Creates the root CA if it doesn't already exist.
 */
export function ensureCA() {
  if (fs.existsSync(CA_CERT_PATH) && fs.existsSync(CA_KEY_PATH)) {
    return;
  }
  createCA();
}

/**
 * Generates a domain certificate signed by the root CA.
 * Returns { certPath, keyPath }.
 */
export function generateDomainCert(domain) {
  ensureCA();

  const ca = loadCA();
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(
    cert.validity.notBefore.getFullYear() + 1
  );

  const subjectAttrs = [
    { name: "commonName", value: domain },
    { name: "organizationName", value: "Pugloo" },
  ];

  cert.setSubject(subjectAttrs);
  cert.setIssuer(ca.cert.subject.attributes);

  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
    },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: domain },
        { type: 2, value: `*.${domain}` },
      ],
    },
  ]);

  cert.sign(ca.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

  const domainDir = path.join(CERTS_DIR, domain);
  fs.mkdirSync(domainDir, { recursive: true });

  const certPath = path.join(domainDir, "cert.pem");
  const keyPath = path.join(domainDir, "key.pem");

  fs.writeFileSync(certPath, certPem);
  fs.writeFileSync(keyPath, keyPem, { mode: 0o600 });

  return { certPath, keyPath };
}

/**
 * Returns the paths to the cert and key for a given domain.
 */
export function getCertPaths(domain) {
  const domainDir = path.join(CERTS_DIR, domain);
  return {
    certPath: path.join(domainDir, "cert.pem"),
    keyPath: path.join(domainDir, "key.pem"),
  };
}

/**
 * Trusts the root CA in the system keychain/certificate store.
 * Requires sudo on both macOS and Linux.
 */
export function trustCA() {
  ensureCA();

  const platform = os.platform();

  if (platform === "darwin") {
    execSync(
      `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${CA_CERT_PATH}"`,
      { stdio: "inherit" }
    );
  } else if (platform === "linux") {
    execSync(
      `sudo cp "${CA_CERT_PATH}" /usr/local/share/ca-certificates/pugloo-rootCA.crt`,
      { stdio: "inherit" }
    );
    execSync("sudo update-ca-certificates", { stdio: "inherit" });
  } else {
    throw new Error(`Unsupported platform for automatic CA trust: ${platform}`);
  }
}

/**
 * Removes the root CA from the system keychain/certificate store.
 * Requires sudo on both macOS and Linux.
 */
export function untrustCA() {
  const platform = os.platform();

  if (platform === "darwin") {
    execSync(
      `sudo security remove-trusted-cert -d "${CA_CERT_PATH}"`,
      { stdio: "inherit" }
    );
  } else if (platform === "linux") {
    execSync(
      `sudo rm -f /usr/local/share/ca-certificates/pugloo-rootCA.crt`,
      { stdio: "inherit" }
    );
    execSync("sudo update-ca-certificates", { stdio: "inherit" });
  } else {
    throw new Error(`Unsupported platform for automatic CA untrust: ${platform}`);
  }
}

/**
 * Returns the absolute path to the root CA certificate.
 */
export function getCAPath() {
  return CA_CERT_PATH;
}
