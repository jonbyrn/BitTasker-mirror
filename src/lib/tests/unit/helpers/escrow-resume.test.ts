import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	readEscrowResume,
	saveEscrowResume,
	type EscrowResume
} from '$lib/utils/contract/escrow-resume';

const memory = new Map<string, string>();

beforeEach(() => {
	memory.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => memory.get(key) ?? null,
		setItem: (key: string, value: string) => {
			memory.set(key, value);
		},
		removeItem: (key: string) => {
			memory.delete(key);
		}
	});
});

const row: EscrowResume = {
	contractId: 'contract-1',
	status: 'locked',
	lockedAmount: 2,
	lockedCurrency: 'USD',
	totalAmountUsd: 2,
	settlementAmount: 2_000_000,
	partyPubkeys: ['aa', 'bb'],
	primaryAsset: 'usdt_rgb',
	primaryPercentage: 100,
	secondaryAsset: 'btc_lightning',
	secondaryPercentage: 0,
	savedAt: 10
};

describe('escrow resume', () => {
	it('restores the saved contract after a reload', () => {
		saveEscrowResume(row);
		expect(readEscrowResume('contract-1')?.status).toBe('locked');
		expect(readEscrowResume('missing')).toBeNull();
	});
});
