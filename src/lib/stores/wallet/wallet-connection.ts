import { formatUsdtBalance, usdtPrecision } from '$lib/types/rgb-contract';

/**
 * Wallet connection is derived from data the app already has.
 * These functions never open a passkey prompt and never touch the wallet.
 */

export type WalletPhase = 'logged-out' | 'locked' | 'unlocking' | 'syncing' | 'ready' | 'error';

export type RailId = 'btc_onchain' | 'rgb_usdt' | 'rgb_proxy' | 'lightning';

export type RailHealth = 'ready' | 'syncing' | 'locked' | 'offline' | 'unavailable' | 'error';

export type LightningChannel = 'idle' | 'waiting' | 'open' | 'missing';

export type LightningFailure = '' | 'attach' | 'connect' | 'channel' | 'tab';

export interface RailSnapshot {
	id: RailId;
	label: string;
	health: RailHealth;
	detail: string;
}

export interface WalletConnectionInput {
	authenticated: boolean;
	online: boolean;
	unlocking: boolean;
	reconnecting: boolean;
	locked: boolean;
	initializing: boolean;
	syncing: boolean;
	connected: boolean;
	rgbInitialized: boolean;
	error: string | null;
	rgbError: string | null;
	btcAddress: string;
	sats: number;
	usdtUnits: number;
	usdtPrecision: number;
	lightningReady: boolean;
	lightningChannel: LightningChannel;
	lightningFailure: LightningFailure;
}

export interface WalletConnectionSnapshot {
	phase: WalletPhase;
	headline: string;
	reason: string | null;
	rails: RailSnapshot[];
	sats: number;
	usdtUnits: number;
	usdtText: string;
	balanceHidden: boolean;
}

export interface WalletActionHold {
	hold: boolean;
	message: string;
	needsUnlock: boolean;
	needsRetry: boolean;
}

export type ReconnectReason = 'focus' | 'visible' | 'online' | 'offline';

export type ReconnectDecision = 'offline' | 'reconnect' | 'skip';

const CONNECTED = 'Wallet connected';
const LOCKED = 'Wallet locked, tap to unlock';
const SYNCING = 'Syncing…';
const UNLOCKING = 'Unlocking…';
const LOGGED_OUT = 'Logged out';
const UNLOCK_TO_CONTINUE = 'Unlock wallet to continue';

export function walletConnection(input: WalletConnectionInput): WalletConnectionSnapshot {
	const sats = finite(input.sats);
	const usdtUnits = finite(input.usdtUnits);
	const precision = usdtPrecision('USDT', input.usdtPrecision);
	const usdtText = formatUsdtBalance(usdtUnits, precision);
	const walletReason = cleanReason(input.error) ?? cleanReason(input.rgbError);
	const reason = input.authenticated && !input.online ? 'No connection' : walletReason;
	const phase = resolvePhase(input, reason);
	const headline = headlineFor(phase, reason);
	const balanceHidden = phase === 'logged-out' || phase === 'locked' || phase === 'unlocking';
	return {
		phase,
		headline,
		reason: phase === 'error' ? (reason ?? 'the wallet did not connect') : null,
		rails: railsFor(input, phase, sats, usdtText),
		sats,
		usdtUnits,
		usdtText,
		balanceHidden
	};
}

export function walletActionHold(snapshot: WalletConnectionSnapshot): WalletActionHold {
	if (snapshot.phase === 'ready') {
		return { hold: false, message: '', needsUnlock: false, needsRetry: false };
	}
	if (snapshot.phase === 'locked') {
		return { hold: true, message: UNLOCK_TO_CONTINUE, needsUnlock: true, needsRetry: false };
	}
	if (snapshot.phase === 'unlocking') {
		return { hold: true, message: UNLOCKING, needsUnlock: false, needsRetry: false };
	}
	if (snapshot.phase === 'syncing') {
		return { hold: true, message: SYNCING, needsUnlock: false, needsRetry: false };
	}
	if (snapshot.phase === 'logged-out') {
		return { hold: true, message: 'Log in to continue', needsUnlock: false, needsRetry: false };
	}
	return { hold: true, message: snapshot.headline, needsUnlock: false, needsRetry: true };
}

export class WalletNotReady extends Error {
	readonly needsUnlock: boolean;
	readonly needsRetry: boolean;

	constructor(message: string, needsUnlock: boolean, needsRetry: boolean) {
		super(message);
		this.name = 'WalletNotReady';
		this.needsUnlock = needsUnlock;
		this.needsRetry = needsRetry;
	}
}

/** Throw when an action needs an open wallet. Does not prompt and does not navigate. */
export function requireWalletReady(snapshot: WalletConnectionSnapshot): void {
	const hold = walletActionHold(snapshot);
	if (!hold.hold) return;
	throw new WalletNotReady(hold.message, hold.needsUnlock, hold.needsRetry);
}

export function reconnectDecision(input: {
	authenticated: boolean;
	online: boolean;
	phase: WalletPhase;
	reason: ReconnectReason;
	msSinceAttempt: number;
}): ReconnectDecision {
	if (input.reason === 'offline' || !input.online) return 'offline';
	if (!input.authenticated || input.phase === 'logged-out' || input.phase === 'unlocking') {
		return 'skip';
	}
	if (input.reason === 'online') return 'reconnect';
	if (input.phase === 'syncing') return 'skip';
	const wait = input.phase === 'ready' ? 20_000 : 3_000;
	if (input.msSinceAttempt >= 0 && input.msSinceAttempt < wait) return 'skip';
	return 'reconnect';
}

const ESCROW_CONNECTED = new Set([
	'locked',
	'funded',
	'work_in_progress',
	'work_submitted',
	'approved',
	'settlement_requested',
	'releasing',
	'released_pending',
	'released',
	'settled'
]);

/** One label for the escrow card and the payment card. */
export function paymentCardHeading(input: {
	status: string | null;
	fundingState: string | null;
	invoicePresent: boolean;
	walletPhase: WalletPhase;
	walletHeadline: string;
}): string {
	const status = input.status ?? '';
	const funding = input.fundingState ?? '';
	if (ESCROW_CONNECTED.has(status) || funding === 'funded') return 'Escrow connected';
	if (status === 'locking' || funding === 'verifying_transfer') return 'Connecting escrow…';
	if (
		input.walletPhase === 'locked' ||
		input.walletPhase === 'error' ||
		input.walletPhase === 'logged-out' ||
		input.walletPhase === 'unlocking'
	) {
		return input.walletHeadline;
	}
	if (input.invoicePresent || funding === 'awaiting_payment') return 'Invoice ready';
	if (input.walletPhase === 'syncing') return input.walletHeadline;
	return 'Waiting to connect escrow';
}

export function shortAccount(value: string): string {
	const text = value.trim();
	if (text.length < 16) return text;
	return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

export function statusDot(
	phase: WalletPhase
): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
	if (phase === 'ready') return 'success';
	if (phase === 'locked') return 'warning';
	if (phase === 'unlocking' || phase === 'syncing') return 'info';
	if (phase === 'error') return 'error';
	return 'neutral';
}

function preUnlockTimeout(reason: string | null): boolean {
	if (!reason) return false;
	const text = reason.toLowerCase();
	return text.includes('wallet init timed out') || text.includes('wallet unlock timed out');
}

function resolvePhase(input: WalletConnectionInput, reason: string | null): WalletPhase {
	if (!input.authenticated) return 'logged-out';
	if (!input.online) return 'error';
	if (input.unlocking) return 'unlocking';
	// A locked wallet has not been asked to open yet. A session-database timeout is not a connection error.
	if (input.locked && (!reason || preUnlockTimeout(reason))) return 'locked';
	if (reason) return 'error';
	if (input.locked) return 'locked';
	if (input.reconnecting || input.initializing || input.syncing || !input.connected)
		return 'syncing';
	if (input.rgbInitialized) return 'ready';
	return 'syncing';
}

function headlineFor(phase: WalletPhase, reason: string | null): string {
	if (phase === 'logged-out') return LOGGED_OUT;
	if (phase === 'locked') return LOCKED;
	if (phase === 'unlocking') return UNLOCKING;
	if (phase === 'syncing') return SYNCING;
	if (phase === 'ready') return CONNECTED;
	return `Connection problem: ${reason ?? 'the wallet did not connect'}`;
}

function railsFor(
	input: WalletConnectionInput,
	phase: WalletPhase,
	sats: number,
	usdtText: string
): RailSnapshot[] {
	if (phase === 'logged-out') {
		return [
			rail('btc_onchain', 'Bitcoin', 'unavailable', 'Log in to check Bitcoin'),
			rail('rgb_usdt', 'RGB USDT', 'unavailable', 'Log in to check dollars'),
			rail('rgb_proxy', 'RGB proxy', 'unavailable', 'Log in to check the dollar network'),
			rail('lightning', 'Lightning', 'unavailable', 'Log in to check Lightning')
		];
	}
	if (!input.online) {
		return [
			rail('btc_onchain', 'Bitcoin', 'offline', 'No connection'),
			rail('rgb_usdt', 'RGB USDT', 'offline', 'No connection'),
			rail('rgb_proxy', 'RGB proxy', 'offline', 'No connection'),
			rail('lightning', 'Lightning', 'offline', 'No connection')
		];
	}
	if (phase === 'locked' || phase === 'unlocking') {
		const detail = phase === 'unlocking' ? 'Unlocking…' : 'Unlock to check';
		const health: RailHealth = phase === 'unlocking' ? 'syncing' : 'locked';
		return [
			rail('btc_onchain', 'Bitcoin', health, detail),
			rail('rgb_usdt', 'RGB USDT', health, detail),
			rail('rgb_proxy', 'RGB proxy', health, detail),
			rail('lightning', 'Lightning', health, detail)
		];
	}
	const btc = btcRail(input, phase, sats);
	const usdt = usdtRail(input, phase, usdtText);
	const proxy = proxyRail(input, phase);
	const lightning = lightningRail(input, phase);
	return [btc, usdt, proxy, lightning];
}

function btcRail(input: WalletConnectionInput, phase: WalletPhase, sats: number): RailSnapshot {
	if (phase === 'syncing')
		return rail('btc_onchain', 'Bitcoin', 'syncing', 'Checking on-chain Bitcoin');
	if (input.btcAddress) {
		return rail(
			'btc_onchain',
			'Bitcoin',
			'ready',
			`On-chain Bitcoin is connected · ${group(sats)} sats`
		);
	}
	return rail('btc_onchain', 'Bitcoin', 'error', 'No on-chain Bitcoin address yet');
}

function usdtRail(
	input: WalletConnectionInput,
	phase: WalletPhase,
	usdtText: string
): RailSnapshot {
	if (phase === 'syncing') return rail('rgb_usdt', 'RGB USDT', 'syncing', 'Checking dollars');
	if (input.rgbInitialized && !cleanReason(input.rgbError)) {
		return rail('rgb_usdt', 'RGB USDT', 'ready', `Dollars are connected · $${usdtText} USDT`);
	}
	return rail(
		'rgb_usdt',
		'RGB USDT',
		'error',
		cleanReason(input.rgbError) ?? 'Dollars are not connected'
	);
}

function proxyRail(input: WalletConnectionInput, phase: WalletPhase): RailSnapshot {
	if (phase === 'syncing') {
		return rail('rgb_proxy', 'RGB proxy', 'syncing', 'Checking the dollar network');
	}
	const rgbError = cleanReason(input.rgbError);
	if (rgbError) return rail('rgb_proxy', 'RGB proxy', 'error', rgbError);
	if (input.rgbInitialized) {
		return rail('rgb_proxy', 'RGB proxy', 'ready', 'Dollar network is connected');
	}
	return rail('rgb_proxy', 'RGB proxy', 'error', 'Dollar network is not connected');
}

function lightningRail(input: WalletConnectionInput, phase: WalletPhase): RailSnapshot {
	const failure = lightningFailureText(input.lightningFailure);
	if (failure) return rail('lightning', 'Lightning', 'error', failure);
	if (input.lightningReady || input.lightningChannel === 'open') {
		return rail('lightning', 'Lightning', 'ready', 'Lightning is connected');
	}
	if (input.lightningChannel === 'waiting' || phase === 'syncing') {
		return rail('lightning', 'Lightning', 'syncing', 'Opening Lightning');
	}
	if (input.lightningChannel === 'missing') {
		return rail('lightning', 'Lightning', 'error', 'The Lightning channel did not open');
	}
	return rail('lightning', 'Lightning', 'unavailable', 'Lightning is not open yet');
}

function lightningFailureText(failure: LightningFailure): string {
	if (failure === 'attach') return 'Lightning did not start';
	if (failure === 'connect') return 'Lightning could not connect';
	if (failure === 'channel') return 'The Lightning channel did not open';
	if (failure === 'tab') return 'This wallet is open in another tab';
	return '';
}

function rail(id: RailId, label: string, health: RailHealth, detail: string): RailSnapshot {
	return { id, label, health, detail };
}

function cleanReason(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const text = value.trim();
	return text.length > 0 ? text : null;
}

function finite(value: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function group(value: number): string {
	return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}
