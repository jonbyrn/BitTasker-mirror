import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function readDoc(relativePath: string): string {
	return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('service user docs', () => {
	it('indexes the service lifecycle guides from the docs landing page', () => {
		const readme = readDoc('docs/services/README.md');

		expect(readme).toContain('service-quotes.md');
		expect(readme).toContain('instant-buy.md');
		expect(readme).toContain('troubleshooting.md');
	});

	it('covers negotiated quote routes, handoff, and historical-thread behavior', () => {
		const quotesGuide = readDoc('docs/services/service-quotes.md');

		expect(quotesGuide).toContain('/services/[serviceId]');
		expect(quotesGuide).toContain('Dashboard -> My Services -> Quotes');
		expect(quotesGuide).toContain('Dashboard -> Quotes -> My Quotes');
		expect(quotesGuide).toContain('tab=quotes&view=tasker');
		expect(quotesGuide).toContain('highlight=<escrowId>');
		expect(quotesGuide).toContain('View Contract');
	});

	it('covers instant-buy eligibility, fallback, and contract-only follow-up state', () => {
		const instantBuyGuide = readDoc('docs/services/instant-buy.md');

		expect(instantBuyGuide).toContain('FIXED');
		expect(instantBuyGuide).toContain('TIERED');
		expect(instantBuyGuide).toContain('Request Quote');
		expect(instantBuyGuide).toContain('Instant-buy orders do not create quote timeline entries');
		expect(instantBuyGuide).toContain('highlight=<escrowId>');
	});

	it('covers troubleshooting for route conventions, wallet recovery, offline data, and contracts handoff', () => {
		const troubleshootingGuide = readDoc('docs/services/troubleshooting.md');

		expect(troubleshootingGuide).toContain('/dashboard?tab=quotes&view=tasker');
		expect(troubleshootingGuide).toContain(
			'/dashboard?tab=my-services&view=quotes&service=<encodedServiceAddress>'
		);
		expect(troubleshootingGuide).toContain('/dashboard?tab=contracts&context=services&highlight=<escrowId>');
		expect(troubleshootingGuide).toContain('Wallet and preflight recovery');
		expect(troubleshootingGuide).toContain('Offline and partial-data recovery');
		expect(troubleshootingGuide).toContain('Contracts handoff recovery');
	});
});
