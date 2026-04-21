import { describe, expect, it } from 'vitest';
import { getReviewOutcomeLabel, getReviewSettlementLabel } from '../reviewDisplay';

describe('reviewDisplay labels', () => {
	it('prefers translated labels when available', () => {
		const translate = (key: string) => {
			const table: Record<string, string> = {
				'reviews.settlement.escrow': 'Escrow',
				'reviews.settlement.service_quote_contract': 'Service quote',
				'reviews.outcome.completed': 'Completed',
				'reviews.outcome.disputed_resolved_refund': 'Dispute resolved, refunded'
			};

			return table[key] ?? key;
		};

		expect(getReviewSettlementLabel('escrow', translate)).toBe('Escrow');
		expect(getReviewSettlementLabel('service_quote_contract', translate)).toBe('Service quote');
		expect(getReviewOutcomeLabel('completed', translate)).toBe('Completed');
		expect(getReviewOutcomeLabel('disputed_resolved_refund', translate)).toBe(
			'Dispute resolved, refunded'
		);
	});

	it('falls back to deterministic humanized labels when translation is missing', () => {
		expect(getReviewSettlementLabel('instant_buy_contract')).toBe('Instant buy');
		expect(getReviewOutcomeLabel('disputed_resolved_payout')).toBe('Dispute resolved, paid out');
	});
});
