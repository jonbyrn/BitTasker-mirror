import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readDoc(relativePath: string): Promise<string> {
	return readFile(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('service user docs', () => {
	it('indexes the published service guides from the docs landing page', async () => {
		const readme = await readDoc('docs/services/README.md');

		expect(readme).toContain('./service-quotes.md');
		expect(readme).toContain('./instant-buy.md');
		expect(readme).toContain('./troubleshooting.md');
		expect(readme).toContain('./discovery.md');
	});

	it('documents negotiated quote routes, dashboard contexts, and contract handoff', async () => {
		const quotesGuide = await readDoc('docs/services/service-quotes.md');

		expect(quotesGuide).toContain('/services/[serviceId]');
		expect(quotesGuide).toContain('Dashboard -> My Services -> Quotes');
		expect(quotesGuide).toContain('Dashboard -> Quotes -> My Quotes');
		expect(quotesGuide).toContain('tab=quotes&view=tasker');
		expect(quotesGuide).toContain('highlight=<escrowId>');
		expect(quotesGuide).toContain('View Contract');
	});

	it('documents instant-buy eligibility, fallback behavior, and contracts-only follow-up', async () => {
		const instantBuyGuide = await readDoc('docs/services/instant-buy.md');

		expect(instantBuyGuide).toContain('FIXED');
		expect(instantBuyGuide).toContain('TIERED');
		expect(instantBuyGuide).toContain('Request Quote');
		expect(instantBuyGuide).toContain('Dashboard -> Contracts');
		expect(instantBuyGuide).toContain('do not create quote timeline entries');
	});

	it('documents recovery for wallet, offline, quote, and contracts continuity problems', async () => {
		const troubleshootingGuide = await readDoc('docs/services/troubleshooting.md');

		expect(troubleshootingGuide).toContain('wallet');
		expect(troubleshootingGuide).toContain('reconnect');
		expect(troubleshootingGuide).toContain('Request Quote');
		expect(troubleshootingGuide).toContain('/dashboard?tab=contracts&context=services&highlight=<escrowId>');
		expect(troubleshootingGuide).toContain('highlight=<escrowId>');
	});

	it('documents public service discovery and homepage featured-services behavior', async () => {
		const discoveryGuide = await readDoc('docs/services/discovery.md');

		expect(discoveryGuide).toContain('/services');
		expect(discoveryGuide).toContain('/services/[serviceId]');
		expect(discoveryGuide).toContain('Featured Services');
		expect(discoveryGuide).toContain('View Service');
		expect(discoveryGuide).toContain('Request Quote');
	});
});
