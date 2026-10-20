import { writable } from 'svelte/store';
import { getPublicKey, type Event } from 'nostr-tools/pure';
import type { PayoutSplit } from '$lib/escrow/payoutSplit';
import type { RgbAllocation } from '$lib/rgb';
import { createMockDesk, type CreditDesk, type DeskParty } from './flow';
import type { AdvanceRecord, EscrowSnapshot } from './types';

const STORAGE_KEY = 'bittasker.credit.mock-desk.v1';

interface SavedDesk {
	version: 1;
	secrets: { worker: string; lender: string; hirer: string };
	escrow: EscrowSnapshot;
	history: Event[];
	events: Event[];
	advance: AdvanceRecord | null;
	split: PayoutSplit | null;
	lenderLossCents: number;
	notice: string | null;
	useNewcomer: boolean;
	coins: RgbAllocation[];
	confirmations: Record<string, number>;
}

export function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
	if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
		throw new Error('Key hex is not valid');
	}
	const out = new Uint8Array(hex.length / 2);
	for (let index = 0; index < out.length; index += 1) {
		out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return out;
}

function party(role: DeskParty['role'], hex: string): DeskParty {
	const secret = hexToBytes(hex);
	return { role, secret, pubkey: getPublicKey(secret) };
}

/**
 * Test-ledger keys stay in sessionStorage on this browser.
 * They are not the RGB wallet and nothing here sends them to a server.
 */
export function saveDesk(desk: CreditDesk): void {
	if (typeof sessionStorage === 'undefined') return;
	const snapshot = desk.adapter.snapshot();
	const saved: SavedDesk = {
		version: 1,
		secrets: {
			worker: bytesToHex(desk.parties.worker.secret),
			lender: bytesToHex(desk.parties.lender.secret),
			hirer: bytesToHex(desk.parties.hirer.secret)
		},
		escrow: desk.escrow,
		history: desk.history,
		events: desk.events,
		advance: desk.advance,
		split: desk.split,
		lenderLossCents: desk.lenderLossCents,
		notice: desk.notice,
		useNewcomer: desk.useNewcomer,
		coins: snapshot.coins,
		confirmations: snapshot.confirmations
	};
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

export function loadDesk(): CreditDesk | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const saved = JSON.parse(raw) as SavedDesk;
		if (saved.version !== 1) return null;
		const desk = createMockDesk();
		desk.parties = {
			worker: party('worker', saved.secrets.worker),
			lender: party('lender', saved.secrets.lender),
			hirer: party('hirer', saved.secrets.hirer)
		};
		desk.escrow = saved.escrow;
		desk.history = saved.history;
		desk.events = saved.events;
		desk.advance = saved.advance;
		desk.split = saved.split;
		desk.lenderLossCents = saved.lenderLossCents;
		desk.notice = saved.notice;
		desk.useNewcomer = saved.useNewcomer;
		desk.adapter.restore(saved.coins, saved.confirmations);
		return desk;
	} catch {
		return null;
	}
}

export function clearDesk(): void {
	if (typeof sessionStorage === 'undefined') return;
	sessionStorage.removeItem(STORAGE_KEY);
}

export const creditDeskStore = writable<CreditDesk | null>(null);

export function openCreditDesk(): CreditDesk {
	const loaded = loadDesk() ?? createMockDesk();
	saveDesk(loaded);
	creditDeskStore.set(loaded);
	return loaded;
}

export function commitCreditDesk(desk: CreditDesk): void {
	saveDesk(desk);
	creditDeskStore.set({ ...desk });
}

export function resetCreditDesk(): CreditDesk {
	clearDesk();
	const desk = createMockDesk();
	saveDesk(desk);
	creditDeskStore.set(desk);
	return desk;
}
