#!/usr/bin/env node

/**
 * Playwright Test Runner
 * 
 * Usage: npm run test:playwright <command> [options]
 * 
 * Available Commands:
 * 
 * Basic Test Execution:
 *   run              Run all tests (default)
 *   ui               Open Playwright UI mode for interactive testing
 *   headed           Run tests in headed mode (visible browser)
 *   debug            Run tests in debug mode with Playwright Inspector
 * 
 * Specific Test Suites:
 *   wallet           Run wallet-related E2E tests only
 *   wallet:unit      Run wallet unit tests only
 *   wallet:full      Run wallet unit tests + E2E tests
 *   auth             Run authentication tests only
 * 
 * Setup Commands:
 *   setup-auth       Generate authentication state for tests
 * 
 * Examples:
 *   npm run test:playwright run
 *   npm run test:playwright ui
 *   npm run test:playwright wallet
 *   npm run test:playwright wallet:full
 *   npm run test:playwright run -- --project=chromium
 *   npm run test:playwright wallet -- --headed
 * 
 * Passing Additional Arguments:
 *   Use -- to pass arguments to the underlying command:
 *   npm run test:playwright run -- --project=firefox --workers=2
 */

import { spawn } from 'child_process';

// Wallet unit test files (previously in test:unit:wallet)
const WALLET_UNIT_TESTS = [
    'src/lib/tests/components/WalletPaymentModal.test.ts',
    'src/lib/tests/components/ReceivePaymentForm.test.ts',
    'src/lib/tests/components/ReceivePaymentForm.integration.test.ts',
    'src/lib/tests/components/SendPaymentForm.test.ts',
    'src/lib/tests/components/SendPaymentForm.integration.test.ts',
    'src/lib/tests/components/TransactionHistory.test.ts',
    'src/lib/tests/components/TransactionSuccessScreen.test.ts',
    'src/lib/tests/components/BalanceCard.test.ts',
    'src/lib/tests/components/InvoiceDisplay.test.ts',
    'src/lib/tests/components/AmountDisplay.test.ts',
    'src/lib/tests/components/AmountInputSection.integration.test.ts',
    'src/lib/tests/components/CalculatorKeypad.test.ts',
    'src/lib/tests/stores/wallet.store.test.ts',
    'src/lib/tests/stores/wallet.store.functions.test.ts',
    'src/lib/tests/stores/wallet.store.state.test.ts',
    'src/lib/tests/utils/paymentAddressParser.test.ts',
    'src/lib/tests/utils/feeCalculation.test.ts',
    'src/lib/utils/wallet/__tests__/escrow.test.ts',
    'src/lib/utils/wallet/__tests__/loadContractsByAddress.test.ts',
];

const commands = {
    // Basic Playwright commands
    'run': { cmd: 'playwright', args: ['test'] },
    'ui': { cmd: 'playwright', args: ['test', '--ui'] },
    'headed': { cmd: 'playwright', args: ['test', '--headed'] },
    'debug': { cmd: 'playwright', args: ['test', '--debug'] },

    // Specific test suites
    'wallet': { cmd: 'playwright', args: ['test', 'tests/e2e/wallet'] },
    'auth': { cmd: 'playwright', args: ['test', 'tests/e2e/auth*.spec.ts'] },

    // Wallet unit tests (Vitest)
    'wallet:unit': { cmd: 'vitest', args: ['--run', ...WALLET_UNIT_TESTS] },

    // Setup commands
    'setup-auth': { cmd: 'npx', args: ['tsx', 'tests/e2e/scripts/setup-auth.ts'] },
};

function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        console.log(`\n→ Running: ${cmd} ${args.join(' ')}\n`);

        const proc = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Command failed with exit code ${code}`));
            } else {
                resolve();
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

function showHelp() {
    console.log(`
Playwright Test Runner

Usage: npm run test:playwright <command> [options]

Available Commands:

Basic Test Execution:
  run              Run all tests (default)
  ui               Open Playwright UI mode for interactive testing
  headed           Run tests in headed mode (visible browser)
  debug            Run tests in debug mode with Playwright Inspector

Specific Test Suites:
  wallet           Run wallet-related E2E tests only
  wallet:unit      Run wallet unit tests only
  wallet:full      Run wallet unit tests + E2E tests
  auth             Run authentication tests only

Setup Commands:
  setup-auth       Generate authentication state for tests

Examples:
  npm run test:playwright run
  npm run test:playwright ui
  npm run test:playwright wallet
  npm run test:playwright wallet:full
  npm run test:playwright run -- --project=chromium
  npm run test:playwright wallet -- --headed

Passing Additional Arguments:
  Use -- to pass arguments to the underlying command:
  npm run test:playwright run -- --project=firefox --workers=2
`);
}

async function main() {
    const [, , commandName, ...extraArgs] = process.argv;

    if (!commandName || commandName === 'help' || commandName === '--help') {
        showHelp();
        process.exit(0);
    }

    // Handle wallet:full (run unit tests then E2E)
    if (commandName === 'wallet:full') {
        try {
            console.log('\n═══════════════════════════════════════');
            console.log('   Running Wallet Unit Tests');
            console.log('═══════════════════════════════════════\n');

            const unitCmd = commands['wallet:unit'];
            await runCommand(unitCmd.cmd, unitCmd.args);

            console.log('\n✓ Unit tests passed!\n');
            console.log('═══════════════════════════════════════');
            console.log('   Running Wallet E2E Tests');
            console.log('═══════════════════════════════════════\n');

            const e2eCmd = commands['wallet'];
            await runCommand(e2eCmd.cmd, [...e2eCmd.args, ...extraArgs]);

            console.log('\n✓ All wallet tests passed!\n');
        } catch (error) {
            console.error('\n✗ Tests failed\n');
            process.exit(1);
        }
        return;
    }

    // Handle regular commands
    const command = commands[commandName];

    if (!command) {
        console.error(`\n✗ Unknown command: ${commandName}\n`);
        showHelp();
        process.exit(1);
    }

    try {
        await runCommand(command.cmd, [...command.args, ...extraArgs]);
        console.log('\n✓ Tests completed\n');
    } catch (error) {
        console.error('\n✗ Tests failed\n');
        process.exit(1);
    }
}

main();

