/** IFA USDT uses precision 6: 1 dollar is 1_000_000 base units, so 1 cent is 10_000. */
export const USDT_BASE_UNITS_PER_CENT = 10_000;

export function assertCents(cents: number, label = 'Amount'): void {
	if (!Number.isSafeInteger(cents) || cents < 0) {
		throw new Error(`${label} must be a whole number of cents`);
	}
}

export function centsToUnits(cents: number): number {
	assertCents(cents);
	const units = cents * USDT_BASE_UNITS_PER_CENT;
	if (!Number.isSafeInteger(units)) throw new Error('Amount is too large');
	return units;
}

export function unitsToCents(units: number): number {
	if (!Number.isSafeInteger(units) || units < 0) {
		throw new Error('Units must be a whole number');
	}
	if (units % USDT_BASE_UNITS_PER_CENT !== 0) {
		throw new Error('Units are not a whole number of cents');
	}
	return units / USDT_BASE_UNITS_PER_CENT;
}

/** $40.40 from 4040 cents. */
export function formatCents(cents: number): string {
	if (!Number.isSafeInteger(cents)) throw new Error('Amount must be a whole number of cents');
	const negative = cents < 0;
	const abs = Math.abs(cents);
	const dollars = Math.floor(abs / 100);
	const rem = abs % 100;
	return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rem.toString().padStart(2, '0')}`;
}

export function feeOnAdvance(advanceCents: number, feeBps: number): number {
	assertCents(advanceCents, 'Advance');
	if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
		throw new Error('Fee is out of range');
	}
	return Math.round((advanceCents * feeBps) / 10_000);
}
