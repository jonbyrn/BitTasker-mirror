import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
	return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('service code docs coverage', () => {
	it('documents the canonical service-quote publish entry points', () => {
		const source = readRepoFile('src/lib/utils/service-quote/publish.ts');

		expect(source).toMatch(
			/Publishes the canonical `6420` quote-request event[\s\S]*export async function publishServiceQuoteRequest/
		);
		expect(source).toMatch(
			/Publishes the canonical `6421` proposal event[\s\S]*export async function publishServiceProposal/
		);
		expect(source).toMatch(
			/Publishes the canonical `6422` proposal-status event[\s\S]*export async function publishServiceProposalStatus/
		);
	});

	it('documents the instant-buy snapshot and service revalidation helpers', () => {
		const source = readRepoFile('src/lib/utils/service-instant-buy/create.ts');

		expect(source).toMatch(
			/Produces the immutable purchase snapshot used by instant-buy confirmation and contract creation\./
		);
		expect(source).toMatch(
			/Re-fetches the latest listing version and fails closed when the loaded snapshot is stale or ineligible\./
		);
	});

	it('documents the service-contract preflight feedback mapper', () => {
		const source = readRepoFile('src/lib/utils/service-contract/preflight-feedback.ts');

		expect(source).toMatch(
			/Maps service-contract preflight failures into stable user-facing recovery copy\./
		);
		expect(source).toMatch(/export function describeServiceContractPreflightFailure/);
	});

	it('documents the dashboard route canonicalization helper', () => {
		const source = readRepoFile('src/lib/utils/service-quote/dashboard-route.ts');

		expect(source).toMatch(
			/Canonicalizes dashboard quote\/contract query params against the locked route contract\./
		);
		expect(source).toMatch(/export function parseServiceQuoteDashboardQuery/);
	});

	it('documents the homepage featured-services adapter and browse-route SEO helper', () => {
		const featuredSource = readRepoFile('src/lib/services/featuredServices.service.ts');
		const browseSeoSource = readRepoFile('src/lib/utils/seo/servicesBrowseSeo.ts');

		expect(featuredSource).toMatch(
			/Loads homepage featured services using localized display labels and canonical-safe service hrefs\./
		);
		expect(browseSeoSource).toMatch(
			/Builds the canonical browse-route SEO payload for `\/services`, including OG\/Twitter image parity and JSON-LD\./
		);
		expect(browseSeoSource).toMatch(/export function getServicesBrowseSeo/);
	});
});
