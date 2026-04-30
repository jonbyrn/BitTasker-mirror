import { expect, test, type Page } from '@playwright/test';

type HeadSnapshot = {
	title: string;
	descriptionCount: number;
	canonicalCount: number;
	description: string | null;
	robots: string | null;
	canonical: string | null;
	ogTitle: string | null;
	ogDescription: string | null;
	ogImage: string | null;
	twitterTitle: string | null;
	twitterDescription: string | null;
	twitterImage: string | null;
	serviceJsonLd: Record<string, unknown> | null;
};

test.describe('service route metadata parity', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'SEO head assertions are pinned on Chromium.');

	test('keeps service detail metadata, canonical, and preview tags in parity', async ({ page }) => {
		await mockServiceLookup(page, [buildServiceEvent()]);

		await page.goto('/services/premium-design-service', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(
			() =>
				document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ===
					'https://bittasker.com/services/premium-design-service' &&
				document.head.querySelector('meta[property="og:title"]')?.getAttribute('content') ===
					'Premium Design Service - BitTasker'
		);

		const head = await readHeadSnapshot(page);

		expect(head.title).toBe('Premium Design Service - BitTasker');
		expect(head.descriptionCount).toBe(1);
		expect(head.canonicalCount).toBe(1);
		expect(head.description).toBe('Detailed design work for your product launch.');
		expect(head.robots).toBe('index, follow, max-image-preview:large');
		expect(head.canonical).toBe('https://bittasker.com/services/premium-design-service');
		expect(head.ogTitle).toBe(head.title);
		expect(head.ogDescription).toBe(head.description);
		expect(head.ogImage).toBe('https://cdn.example.com/service.jpg');
		expect(head.twitterTitle).toBe(head.title);
		expect(head.twitterDescription).toBe(head.description);
		expect(head.twitterImage).toBe(head.ogImage);
		expect(head.serviceJsonLd).toMatchObject({
			'@type': 'Service',
			'@id': 'https://bittasker.com/services/premium-design-service#service',
			url: 'https://bittasker.com/services/premium-design-service',
			mainEntityOfPage: 'https://bittasker.com/services/premium-design-service',
			image: 'https://cdn.example.com/service.jpg'
		});
	});

	test('noindexes missing service details while preserving fallback canonical parity', async ({ page }) => {
		await mockServiceLookup(page, []);

		await page.goto('/services/missing-service', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(
			() =>
				document.head.querySelector('meta[name="robots"]')?.getAttribute('content') ===
					'noindex, follow' &&
				document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ===
					'https://bittasker.com/services/missing-service'
		);

		const head = await readHeadSnapshot(page);

		expect(head.title).toBe('Service Details - BitTasker');
		expect(head.descriptionCount).toBe(1);
		expect(head.canonicalCount).toBe(1);
		expect(head.robots).toBe('noindex, follow');
		expect(head.canonical).toBe('https://bittasker.com/services/missing-service');
		expect(head.ogTitle).toBe(head.title);
		expect(head.ogDescription).toBe(head.description);
		expect(head.twitterTitle).toBe(head.title);
		expect(head.twitterDescription).toBe(head.description);
		expect(head.serviceJsonLd).toBeNull();
	});
});

function buildServiceEvent() {
	return {
		id: 'service-event-1',
		pubkey: 'b'.repeat(64),
		created_at: 1_700_000_000,
		kind: 30_402,
		tags: [['d', 'premium-design-service']],
		content: JSON.stringify({
			uniqueId: 'premium-design-service',
			title: 'Premium Design Service',
			description: 'Detailed design work for your product launch.',
			status: 'active',
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: {
				type: 'TIERED',
				currency: 'USD',
				tiers: [
					{
						id: 'basic',
						name: 'Basic',
						description: 'Basic package',
						price: 85,
						features: ['One revision']
					},
					{
						id: 'pro',
						name: 'Pro',
						description: 'Pro package',
						price: 160,
						features: ['Priority support']
					}
				]
			},
			skills: ['Design'],
			categories: [{ id: 'design', name: 'Design', slug: 'design' }],
			portfolio: [{ url: 'https://cdn.example.com/service.jpg', type: 'image/jpeg', alt: 'Service' }],
			createdAt: 1_700_000_000,
			creator: {
				username: 'designer-pro',
				avatar: ''
			}
		}),
		sig: 'sig'
	};
}

async function mockServiceLookup(page: Page, events: unknown[]) {
	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});
}

async function readHeadSnapshot(page: Page): Promise<HeadSnapshot> {
	return page.evaluate(() => {
		const readMeta = (selector: string) =>
			document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;
		const serviceJsonLd =
			Array.from(
				document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
			)
				.map((script) => script.textContent)
				.filter((value): value is string => Boolean(value))
				.map((value) => {
					try {
						return JSON.parse(value) as Record<string, unknown>;
					} catch {
						return null;
					}
				})
				.find((value) => value?.['@type'] === 'Service') ?? null;

		return {
			title: document.title,
			descriptionCount: document.head.querySelectorAll('meta[name="description"]').length,
			canonicalCount: document.head.querySelectorAll('link[rel="canonical"]').length,
			description: readMeta('meta[name="description"]'),
			robots: readMeta('meta[name="robots"]'),
			canonical:
				document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
			ogTitle: readMeta('meta[property="og:title"]'),
			ogDescription: readMeta('meta[property="og:description"]'),
			ogImage: readMeta('meta[property="og:image"]'),
			twitterTitle: readMeta('meta[name="twitter:title"]'),
			twitterDescription: readMeta('meta[name="twitter:description"]'),
			twitterImage: readMeta('meta[name="twitter:image"]'),
			serviceJsonLd
		};
	});
}
