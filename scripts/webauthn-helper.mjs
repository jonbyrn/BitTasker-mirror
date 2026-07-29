#!/usr/bin/env node

/**
 * WebAuthn Helper Script - Automated passkey operations for BitTasker
 *
 * Usage:
 *   node scripts/webauthn-helper.mjs register --nsec <nsec> --url <url> --output <file>
 *   node scripts/webauthn-helper.mjs login --nsec <nsec> --url <url> --credentials <file>
 *   node scripts/webauthn-helper.mjs login-nsec --nsec <nsec> --url <url>
 *   node scripts/webauthn-helper.mjs export --url <url> --credentials <file>
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// --- Debug Logging ---
const DEBUG = process.env.DEBUG === '1' || process.argv.includes('--debug');
const logs = [];

function dbg(msg, ...args) {
    const entry = `[${new Date().toISOString()}] ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    if (DEBUG) process.stderr.write(entry + '\n');
    logs.push(entry);
}

// --- CLI Argument Parsing ---
function parseArgs() {
    const args = process.argv.slice(2);
    const flags = {};
    let command = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                flags[key] = next;
                i++;
            } else {
                flags[key] = true;
            }
        } else if (!command) {
            command = arg;
        }
    }

    return { command, flags };
}

function printUsage() {
    process.stderr.write(`
WebAuthn Helper - Automated passkey operations for BitTasker

Usage:
  node scripts/webauthn-helper.mjs <command> [options]

Commands:
  register      Register a new passkey
  login         Login with saved passkey credentials
  login-nsec    Login with nsec only (bypass passkey validation)
  export        Export credentials from a running session

Options:
  --nsec <nsec>          Nostr private key (nsec format)
  --url <url>            App URL (default: http://localhost:3000)
  --output <file>        Output file for credentials (default: credentials.json)
  --credentials <file>   Input file for saved credentials
  --debug                Enable debug logging
  --help                 Show this help message
`);
}

// --- Output Helper ---
function output(obj) {
    obj.logs = logs;
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function fail(error, step = null) {
    output({ success: false, error, step });
    process.exit(1);
}

// --- Credential File I/O ---
function loadCredentials(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        // Handle legacy format: { credentials: [...] }
        if (data && Array.isArray(data.credentials)) {
            return data.credentials;
        }
        // Handle new format: { credentialSets: [...] }
        if (data && Array.isArray(data.credentialSets)) {
            const first = data.credentialSets[0];
            return first?.credentials || [];
        }
        return [];
    } catch (err) {
        throw new Error(`Failed to load credentials from ${filePath}: ${err.message}`);
    }
}

function saveCredentials(filePath, credentials) {
    const data = {
        credentialSets: [
            {
                label: 'default',
                credentials
            }
        ],
        exportedAt: new Date().toISOString()
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Browser & CDP Setup ---
async function setupBrowser() {
    dbg('Launching browser...');
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => dbg(`[console.${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => dbg(`[pageerror] ${err.message}`));
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    dbg('Creating virtual authenticator...');
    const VIRTUAL_AUTHENTICATOR_OPTIONS = {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true
    };
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: VIRTUAL_AUTHENTICATOR_OPTIONS
    });
    await cdp.send('WebAuthn.setAutomaticPresenceSimulation', {
        authenticatorId,
        enabled: true
    });
    dbg('Virtual authenticator created:', authenticatorId);
    return { browser, context, page, cdp, authenticatorId };
}

async function cleanup(browser) {
    if (browser) {
        try {
            await browser.close();
            dbg('Browser closed');
        } catch (err) {
            dbg('Error closing browser:', err.message);
        }
    }
}

// --- Common Login Helpers ---
async function navigateToLogin(page, url) {
    const loginUrl = `${url}/auth/login?fresh=1`;
    dbg('Navigating to login page:', loginUrl);
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
}

async function setTestFlags(page) {
    dbg('Setting test flags...');
    await page.evaluate(() => {
        window.__PLAYWRIGHT_TEST__ = true;
        localStorage.debug = 'btasker:*';
    });
}

async function clickNsecButton(page) {
    dbg('Looking for nsec login button...');
    const nsecButton = page.getByText('Login with Nostr nsec');
    await nsecButton.waitFor({ timeout: 10000 });
    await nsecButton.click();
    dbg('Clicked nsec login button');
    await page.waitForSelector('input[placeholder*="Nostr private key"]', { timeout: 10000 });
}

async function typeNsecAndLogin(page, nsec) {
    dbg('Typing nsec...');
    const input = page.locator('input[placeholder*="Nostr private key"]');
    await input.fill(nsec);
    await input.press('Tab');
    dbg('Waiting for Login button to be enabled...');
    await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginBtn = buttons.find(b => b.textContent.trim() === 'Login');
        return loginBtn && !loginBtn.disabled;
    }, { timeout: 10000 });
    dbg('Clicking Login button...');
    const loginButton = page.getByRole('button', { name: 'Login' });
    await loginButton.click();
}

async function waitForLoginSuccess(page, timeout = 60000) {
    dbg('Waiting for login success...');
    try {
        await page.waitForFunction(() => {
            const accessToken = localStorage.getItem('CapacitorStorage.access_token');
            const refreshToken = localStorage.getItem('CapacitorStorage.refresh_token');
            const directAccess = localStorage.getItem('access_token');
            const directRefresh = localStorage.getItem('refresh_token');
            return accessToken || directAccess || directRefresh;
        }, { timeout });
    } catch {
        const url = page.url();
        if (url.includes('/dashboard') || url.includes('/tasks')) {
            dbg('Detected dashboard redirect');
        } else {
            throw new Error('Login timeout - no tokens or dashboard redirect detected');
        }
    }
    dbg('Login successful');
    const tokens = await page.evaluate(() => {
        const get = (key) => localStorage.getItem(`CapacitorStorage.${key}`) || localStorage.getItem(key);
        return {
            access_token: get('access_token'),
            refresh_token: get('refresh_token'),
        };
    });
    return tokens;
}

// --- Register Command ---
async function cmdRegister(flags) {
    const { nsec, url = 'http://localhost:3000', output: outputFile = 'credentials.json' } = flags;
    if (!nsec) fail('--nsec is required', 'argument_validation');
    let browser = null;
    try {
        const setup = await setupBrowser();
        browser = setup.browser;
        const { page, cdp, authenticatorId } = setup;
        await navigateToLogin(page, url);
        await setTestFlags(page);
        dbg('Waiting for login page elements...');
        await page.waitForSelector('button', { timeout: 15000 });
        await clickNsecButton(page);
        await typeNsecAndLogin(page, nsec);
        const tokens = await waitForLoginSuccess(page);
        await page.waitForTimeout(2000);
        dbg('Exporting credentials...');
        const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
        dbg('Raw credentials from CDP:', credentials);
        const outputPath = path.resolve(outputFile);
        saveCredentials(outputPath, credentials);
        output({
            success: true,
            credentialId: credentials[0]?.credentialId || null,
            authenticatorId,
            credentialsFile: outputPath,
            credentialsCount: credentials.length,
            tokens,
        });
    } catch (err) {
        dbg('Registration failed:', err.message);
        fail(err.message, 'register');
    } finally {
        await cleanup(browser);
    }
}

// --- Login-Nsec Command ---
async function cmdLoginNsec(flags) {
    const { nsec, url = 'http://localhost:3000' } = flags;
    if (!nsec) fail('--nsec is required', 'argument_validation');
    let browser = null;
    try {
        const setup = await setupBrowser();
        browser = setup.browser;
        const { page } = setup;
        await navigateToLogin(page, url);
        await setTestFlags(page);
        dbg('Waiting for login page elements...');
        await page.waitForSelector('button', { timeout: 15000 });
        await clickNsecButton(page);
        await typeNsecAndLogin(page, nsec);
        const tokens = await waitForLoginSuccess(page);
        output({ success: true, tokens, currentUrl: page.url() });
    } catch (err) {
        dbg('Login failed:', err.message);
        fail(err.message, 'login-nsec');
    } finally {
        await cleanup(browser);
    }
}

// --- Login Command (with saved credentials) ---
async function cmdLogin(flags) {
    const { nsec, url = 'http://localhost:3000', credentials: credFile } = flags;
    if (!credFile) fail('--credentials is required', 'argument_validation');
    let browser = null;
    try {
        const setup = await setupBrowser();
        browser = setup.browser;
        const { page, cdp, authenticatorId } = setup;
        const savedCreds = loadCredentials(path.resolve(credFile));
        dbg('Loaded saved credentials:', savedCreds.length);
        for (const cred of savedCreds) {
            dbg('Adding credential:', cred.credentialId);
            await cdp.send('WebAuthn.addCredential', {
                authenticatorId,
                credential: {
                    credentialId: cred.credentialId,
                    isResidentCredential: cred.isResidentCredential ?? true,
                    rpId: cred.rpId || 'localhost',
                    privateKey: cred.privateKey,
                    userHandle: cred.userHandle || undefined,
                    signCount: cred.signCount || 0,
                }
            });
        }
        await navigateToLogin(page, url);
        await setTestFlags(page);
        dbg('Waiting for login page elements...');
        await page.waitForSelector('button', { timeout: 15000 });
        dbg('Looking for passkey login button...');
        const passkeyButton = page.getByText('Login with Passkey');
        await passkeyButton.waitFor({ timeout: 10000 });
        await passkeyButton.click();
        dbg('Clicked passkey login button');
        const tokens = await waitForLoginSuccess(page);
        output({
            success: true,
            credentialId: savedCreds[0]?.credentialId || null,
            tokens,
            currentUrl: page.url(),
        });
    } catch (err) {
        dbg('Login with credentials failed:', err.message);
        fail(err.message, 'login');
    } finally {
        await cleanup(browser);
    }
}

// --- Export Command ---
async function cmdExport(flags) {
    const { url = 'http://localhost:3000', credentials: outputFile = 'credentials.json' } = flags;
    let browser = null;
    try {
        const setup = await setupBrowser();
        browser = setup.browser;
        const { page, cdp, authenticatorId } = setup;
        await navigateToLogin(page, url);
        await setTestFlags(page);
        await page.waitForSelector('button', { timeout: 15000 });
        dbg('Exporting credentials...');
        const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
        dbg('Exported credentials:', credentials.length);
        const outputPath = path.resolve(outputFile);
        saveCredentials(outputPath, credentials);
        output({
            success: true,
            credentialsCount: credentials.length,
            credentialsFile: outputPath,
            credentials,
        });
    } catch (err) {
        dbg('Export failed:', err.message);
        fail(err.message, 'export');
    } finally {
        await cleanup(browser);
    }
}

// --- Main ---
async function main() {
    const { command, flags } = parseArgs();
    if (flags.help || !command) {
        printUsage();
        process.exit(command ? 0 : 1);
    }
    dbg('Command:', command);
    dbg('Flags:', flags);
    switch (command) {
        case 'register': await cmdRegister(flags); break;
        case 'login': await cmdLogin(flags); break;
        case 'login-nsec': await cmdLoginNsec(flags); break;
        case 'export': await cmdExport(flags); break;
        default: fail(`Unknown command: ${command}. Use --help for usage.`, 'argument_validation');
    }
}

main().catch(err => {
    dbg('Unhandled error:', err);
    fail(err.message, 'main');
});
