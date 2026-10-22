import { describe, expect, it } from 'vitest';
import {
	paymentCardHeading,
	reconnectDecision,
	requireWalletReady,
	shortAccount,
	walletActionHold,
	walletConnection,
	WalletNotReady,
	type WalletConnectionInput
} from '$lib/stores/wallet/wallet-connection';

function input(overrides: Partial<WalletConnectionInput> = {}): WalletConnectionInput {
	return {
		authenticated: true,
		online: true,
		unlocking: false,
		reconnecting: false,
		locked: false,
		initializing: false,
		syncing: false,
		connected: true,
		rgbInitialized: true,
		error: null,
		rgbError: null,
		btcAddress: 'tb1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
		sats: 1500,
		usdtUnits: 20_000_000,
		usdtPrecision: 6,
		lightningReady: false,
		lightningChannel: 'idle',
		lightningFailure: '',
		...overrides
	};
}

describe('walletConnection', () => {
	it('says logged out without asking for a wallet', () => {
		const status = walletConnection(input({ authenticated: false, locked: true, error: 'secret' }));
		expect(status.phase).toBe('logged-out');
		expect(status.headline).toBe('Logged out');
		expect(status.rails.every((rail) => rail.health === 'unavailable')).toBe(true);
		expect(status.balanceHidden).toBe(true);
	});

	it('uses the plain locked, unlocking, syncing, and connected words', () => {
		expect(
			walletConnection(input({ locked: true, connected: false, rgbInitialized: false })).headline
		).toBe('Wallet locked, tap to unlock');
		expect(walletConnection(input({ unlocking: true, locked: true })).headline).toBe('Unlocking…');
		expect(walletConnection(input({ syncing: true })).headline).toBe('Syncing…');
		expect(walletConnection(input()).headline).toBe('Wallet connected');
	});

	it('stays locked when the only error is the pre-unlock timeout', () => {
		const status = walletConnection(
			input({
				locked: true,
				connected: false,
				rgbInitialized: false,
				error: 'Wallet init timed out'
			})
		);
		expect(status.phase).toBe('locked');
		expect(status.headline).toBe('Wallet locked, tap to unlock');
		expect(status.reason).toBeNull();
	});

	it('keeps the failure reason on a connection problem', () => {
		const status = walletConnection(
			input({
				connected: false,
				rgbInitialized: false,
				error: 'Wallet transport auth is missing'
			})
		);
		expect(status.phase).toBe('error');
		expect(status.headline).toBe('Connection problem: Wallet transport auth is missing');
		expect(status.reason).toBe('Wallet transport auth is missing');
	});

	it('shows no connection when the network drops, even if the wallet was open', () => {
		const status = walletConnection(input({ online: false, error: 'old error' }));
		expect(status.headline).toBe('Connection problem: No connection');
		expect(status.rails.map((rail) => rail.detail)).toEqual([
			'No connection',
			'No connection',
			'No connection',
			'No connection'
		]);
	});

	it('reports each rail on its own when the wallet is open', () => {
		const status = walletConnection(
			input({
				lightningReady: false,
				lightningChannel: 'missing',
				lightningFailure: 'connect'
			})
		);
		expect(status.phase).toBe('ready');
		expect(status.headline).toBe('Wallet connected');
		expect(status.rails.find((rail) => rail.id === 'btc_onchain')?.detail).toContain('1,500 sats');
		expect(status.rails.find((rail) => rail.id === 'rgb_usdt')?.detail).toContain('$20.00');
		expect(status.rails.find((rail) => rail.id === 'rgb_proxy')?.health).toBe('ready');
		expect(status.rails.find((rail) => rail.id === 'lightning')?.detail).toBe(
			'Lightning could not connect'
		);
	});

	it('hides the balance while locked', () => {
		const status = walletConnection(
			input({ locked: true, connected: false, rgbInitialized: false })
		);
		expect(status.balanceHidden).toBe(true);
		expect(status.rails.every((rail) => rail.detail === 'Unlock to check')).toBe(true);
	});
});

describe('wallet action gate', () => {
	it('stops a locked action with unlock text and does not treat it as success', () => {
		const status = walletConnection(
			input({ locked: true, connected: false, rgbInitialized: false })
		);
		expect(walletActionHold(status)).toEqual({
			hold: true,
			message: 'Unlock wallet to continue',
			needsUnlock: true,
			needsRetry: false
		});
		expect(() => requireWalletReady(status)).toThrow(WalletNotReady);
		try {
			requireWalletReady(status);
		} catch (error) {
			expect(error).toBeInstanceOf(WalletNotReady);
			expect((error as WalletNotReady).message).toBe('Unlock wallet to continue');
		}
	});

	it('lets a connected wallet through and retries a real failure', () => {
		expect(walletActionHold(walletConnection(input())).hold).toBe(false);
		const failed = walletConnection(
			input({ connected: false, rgbInitialized: false, error: 'Balance scan failed' })
		);
		expect(walletActionHold(failed).needsRetry).toBe(true);
		expect(walletActionHold(failed).message).toBe('Connection problem: Balance scan failed');
	});
});

describe('reconnectDecision', () => {
	it('marks the network down and reconnects after it returns', () => {
		expect(
			reconnectDecision({
				authenticated: true,
				online: false,
				phase: 'ready',
				reason: 'offline',
				msSinceAttempt: 60_000
			})
		).toBe('offline');
		expect(
			reconnectDecision({
				authenticated: true,
				online: true,
				phase: 'error',
				reason: 'online',
				msSinceAttempt: 0
			})
		).toBe('reconnect');
	});

	it('reconnects a locked wallet on focus without treating a fresh ready wallet as stale', () => {
		expect(
			reconnectDecision({
				authenticated: true,
				online: true,
				phase: 'locked',
				reason: 'visible',
				msSinceAttempt: 5_000
			})
		).toBe('reconnect');
		expect(
			reconnectDecision({
				authenticated: true,
				online: true,
				phase: 'ready',
				reason: 'focus',
				msSinceAttempt: 1_000
			})
		).toBe('skip');
		expect(
			reconnectDecision({
				authenticated: true,
				online: true,
				phase: 'unlocking',
				reason: 'focus',
				msSinceAttempt: 60_000
			})
		).toBe('skip');
		expect(
			reconnectDecision({
				authenticated: false,
				online: true,
				phase: 'logged-out',
				reason: 'focus',
				msSinceAttempt: 60_000
			})
		).toBe('skip');
	});
});

describe('payment and escrow cards', () => {
	it('says escrow is connected once funding has happened', () => {
		expect(
			paymentCardHeading({
				status: 'funded',
				fundingState: 'funded',
				invoicePresent: true,
				walletPhase: 'ready',
				walletHeadline: 'Wallet connected'
			})
		).toBe('Escrow connected');
		expect(
			paymentCardHeading({
				status: 'draft',
				fundingState: 'funded',
				invoicePresent: true,
				walletPhase: 'locked',
				walletHeadline: 'Wallet locked, tap to unlock'
			})
		).toBe('Escrow connected');
	});

	it('does not say waiting to connect when the wallet is the thing that is blocked', () => {
		expect(
			paymentCardHeading({
				status: 'draft',
				fundingState: 'idle',
				invoicePresent: false,
				walletPhase: 'locked',
				walletHeadline: 'Wallet locked, tap to unlock'
			})
		).toBe('Wallet locked, tap to unlock');
		expect(
			paymentCardHeading({
				status: 'funding',
				fundingState: 'awaiting_payment',
				invoicePresent: true,
				walletPhase: 'ready',
				walletHeadline: 'Wallet connected'
			})
		).toBe('Invoice ready');
		expect(
			paymentCardHeading({
				status: 'draft',
				fundingState: 'idle',
				invoicePresent: false,
				walletPhase: 'ready',
				walletHeadline: 'Wallet connected'
			})
		).toBe('Waiting to connect escrow');
	});
});

describe('shortAccount', () => {
	it('keeps a short name and shortens a public key', () => {
		expect(shortAccount('Ada')).toBe('Ada');
		expect(shortAccount('npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toBe('npub1qqq…qqqq');
	});
});
