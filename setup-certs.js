#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define paths
const CERT_DIR = path.join(__dirname, 'cert');
const CERT_FILE = path.join(CERT_DIR, 'localhost.pem');
const KEY_FILE = path.join(CERT_DIR, 'localhost-key.pem');

// Ensure cert directory exists
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR);
}

// Check for mkcert
const hasMkcert = () => {
  try {
    execSync('mkcert --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Guide user to install mkcert based on OS
const installMkcert = () => {
  console.log('❗ mkcert is not installed.');

  if (process.platform === 'darwin') {
    console.log('👉 Installing mkcert using Homebrew...');
    execSync('brew install mkcert', { stdio: 'inherit' });
  } else if (process.platform === 'win32') {
    console.log('👉 Please install mkcert using Chocolatey:');
    console.log('   choco install mkcert');
  } else if (process.platform === 'linux') {
    console.log('👉 Please install mkcert manually from: https://github.com/FiloSottile/mkcert');
  } else {
    console.log('❌ Unsupported platform. Please install mkcert manually.');
  }
};

// Run mkcert -install
const setupCA = () => {
  console.log('Setting up mkcert root CA...');
  execSync('mkcert -install', { stdio: 'inherit' });
};

// Generate the certs
const generateCerts = () => {
  console.log('Generating certificates for localhost...');
  execSync(`mkcert -key-file ${KEY_FILE} -cert-file ${CERT_FILE} localhost`, {
    stdio: 'inherit',
  });
};

// Run setup
const run = async () => {
  try {
    if (!hasMkcert()) {
      installMkcert();
      if (!hasMkcert()) {
        console.error('❌ mkcert installation failed or mkcert not in PATH.');
        process.exit(1);
      }
    }

    setupCA();
    generateCerts();

    console.log(`✅ Certificates generated at ${CERT_DIR}`);
    console.log('➡️ You can now run `npm run dev` with HTTPS!');
  } catch (err) {
    console.error('❌ Error generating certs:', err);
    process.exit(1);
  }
};

run();