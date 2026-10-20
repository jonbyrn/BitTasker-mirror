import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '$lib/tests/helpers/memory-storage';
import { get } from 'svelte/store';
import {
	acknowledgeWalletSession,
	allocationSignature,
	beginWalletSession,
	foreignView,
	HEARTBEAT_STALE_MS,
	liveBeats,
	noteChainView,
	OTHER_SESSION_WARNING,
	parseBeats,
	resetWalletSession,
	sessionBlocksSend,
	setWalletRefreshing,
	soleLock,
	walletSession,
	withBeat,
	withoutBeat,
	markLocalRefresh,
	markLocalSend
} from '$lib/stores/wallet/wallet-session';

const fingerprint = 'AbC123';
const lockKey = 'bittasker.wallet-lock.abc123';
const viewKey = 'bittasker.wallet-view.abc123';

beforeEach(() => {
	installMemoryStorage();
});

afterEach(() => {
	resetWalletSession();
	localStorage.clear();
});

describe('wallet session lock', () => {
	it('keeps one fresh beat per id and drops a stale one', () => {
		const now = 10_000;
		const beats = parseBeats(
			JSON.stringify([
				{ id: 'self', at: now },
				{ id: 'self', at: now - 10 },
				{ id: 'other', at: now - HEARTBEAT_STALE_MS },
				{ id: '', at: now },
				{ nope: true }
			])
		);
		expect(liveBeats(beats, now).map((beat) => beat.id)).toEqual(['self']);
		expect(soleLock(beats, 'self', now)).toBe(true);
		expect(soleLock(withBeat(beats, 'self', now), 'other', now)).toBe(false);
		expect(parseBeats('not-json')).toEqual([]);
		expect(withoutBeat(beats, 'self').some((beat) => beat.id === 'self')).toBe(false);
	});

	it('blocks while another tab heartbeat is fresh', () => {
		localStorage.setItem(lockKey, JSON.stringify([{ id: 'other-tab', at: Date.now() }]));
		beginWalletSession(fingerprint);
		expect(get(walletSession)).toMatchObject({ holdsLock: false, blocked: true });
		expect(sessionBlocksSend()).toBe(true);
		acknowledgeWalletSession();
		expect(get(walletSession).blocked).toBe(true);
	});

	it('takes the lock when the other heartbeat is stale or gone', () => {
		localStorage.setItem(
			lockKey,
			JSON.stringify([{ id: 'other-tab', at: Date.now() - HEARTBEAT_STALE_MS - 1 }])
		);
		beginWalletSession(fingerprint);
		expect(get(walletSession)).toMatchObject({ holdsLock: true, blocked: false });
		expect(sessionBlocksSend()).toBe(false);

		localStorage.setItem(lockKey, JSON.stringify([{ id: 'other-tab', at: Date.now() }]));
		acknowledgeWalletSession();
		expect(get(walletSession).blocked).toBe(true);

		const mine = parseBeats(localStorage.getItem(lockKey)).filter((beat) => beat.id !== 'other-tab');
		localStorage.setItem(lockKey, JSON.stringify(mine));
		acknowledgeWalletSession();
		expect(get(walletSession)).toMatchObject({ holdsLock: true, blocked: false });
	});

	it('warns when the allocation list changes underneath this session', () => {
		expect(
			foreignView(null, 'aa:0:1', 'self', false)
		).toBe(false);
		expect(
			foreignView({ id: 'self', signature: 'aa:0:1', at: 1 }, 'aa:0:1', 'self', false)
		).toBe(false);
		expect(
			foreignView({ id: 'self', signature: 'aa:0:1', at: 1 }, 'bb:0:2', 'self', true)
		).toBe(false);
		expect(
			foreignView({ id: 'other', signature: 'aa:0:1', at: 1 }, 'bb:0:2', 'self', true)
		).toBe(true);

		beginWalletSession(fingerprint);
		noteChainView('aa:1:70');
		expect(get(walletSession).blocked).toBe(false);

		markLocalSend();
		noteChainView('bb:0:30');
		expect(get(walletSession).blocked).toBe(false);

		localStorage.setItem(
			viewKey,
			JSON.stringify({ id: 'other-browser', signature: 'bb:0:30', at: Date.now() })
		);
		noteChainView('cc:0:10');
		expect(get(walletSession).blocked).toBe(true);
		expect(sessionBlocksSend()).toBe(true);

		acknowledgeWalletSession();
		expect(get(walletSession).blocked).toBe(false);
	});

	it('does not treat our own refresh as another browser', () => {
		beginWalletSession(fingerprint);
		noteChainView('aa:1:100');
		markLocalRefresh();
		noteChainView('bb:0:70');
		expect(get(walletSession).blocked).toBe(false);
	});

	it('ignores a chain note before a wallet session starts', () => {
		noteChainView('aa:1:100');
		expect(localStorage.getItem(viewKey)).toBeNull();
		expect(get(walletSession).blocked).toBe(false);
	});

	it('keeps the refreshing flag until the nested refresh finishes', () => {
		setWalletRefreshing(true);
		setWalletRefreshing(true);
		expect(get(walletSession).refreshing).toBe(true);
		setWalletRefreshing(false);
		expect(get(walletSession).refreshing).toBe(true);
		setWalletRefreshing(false);
		expect(get(walletSession).refreshing).toBe(false);
	});

	it('signs allocations in a stable order', () => {
		expect(
			allocationSignature([
				{ txid: 'BB', vout: 1, amount: 2 },
				{ txid: 'aa', vout: 0, amount: 1 }
			])
		).toBe('aa:0:1|bb:1:2');
		expect(OTHER_SESSION_WARNING).toBe(
			'This wallet is open in another tab or browser. Close it or refresh'
		);
	});
});
