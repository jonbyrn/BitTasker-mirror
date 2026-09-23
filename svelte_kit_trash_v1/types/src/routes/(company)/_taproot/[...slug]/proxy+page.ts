// @ts-nocheck
import { error } from '@sveltejs/kit';
import { resolveContentKey, SLUG_MAP, getHreflangLinks } from '$lib/content/learn/slug-map';
import type { PageLoad } from './$types';
import type { LearnPageContent, LearnPageSeo } from '$lib/types/learn';

/**
 * Use import.meta.glob to statically resolve all content files at build time.
 * Vite cannot handle dynamic imports with multi-level path variables
 * (e.g. `wallet/coldcard`), so glob is required.
 */
const enModules = import.meta.glob('$lib/content/learn/**/*.en.ts', { eager: false });
const esModules = import.meta.glob('$lib/content/learn/**/*.es.ts', { eager: false });

type ContentModule = { content: LearnPageContent };

function buildContentMap(modules: Record<string, unknown>): Record<string, () => Promise<ContentModule>> {
	const map: Record<string, () => Promise<ContentModule>> = {};
	for (const [path, importFn] of Object.entries(modules)) {
		const match = path.match(/content\/learn\/(.+)\.(en|es)\.ts$/);
		if (match) {
			const rawKey = match[1];
			const contentKey = rawKey.endsWith('/index') ? rawKey.slice(0, -6) : rawKey;
			map[contentKey] = importFn as () => Promise<ContentModule>;
		}
	}
	return map;
}

const enContentMap = buildContentMap(enModules);
const esContentMap = buildContentMap(esModules);

/**
 * Explicitly list all locale + slug combinations for prerendering.
 */
export function entries() {
	const result: Array<{ slug: string }> = [];
	for (const [, paths] of Object.entries(SLUG_MAP)) {
		result.push({ slug: paths.en });
	}
	return result;
}

const BASE_URL = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
const OG_IMAGE_BASE = `${BASE_URL}/og-images`;

const PILLAR_OG: Record<string, string> = {
	wallet: 'learn-wallet',
	security: 'learn-security',
	freelancing: 'learn-freelancing',
	'bitcoin-freelancing': 'learn-btc-freelancing',
	bitcoin: 'learn-bitcoin',
	'bitcoin-layer-2': 'learn-btc-l2',
	'future-of-work': 'learn-future'
};

const BREADCRUMB_LABELS: Record<string, Record<string, string>> = {
	wallet: { en: 'Wallets', es: 'Billeteras' },
	security: { en: 'Security', es: 'Seguridad' },
	freelancing: { en: 'Freelancing', es: 'Freelance' },
	'bitcoin-freelancing': { en: 'Bitcoin Freelancing', es: 'Freelance Bitcoin' },
	bitcoin: { en: 'Bitcoin', es: 'Bitcoin' },
	'bitcoin-layer-2': { en: 'Bitcoin Layer 2', es: 'Bitcoin Capa 2' },
	'future-of-work': { en: 'Future of Work', es: 'Futuro del Trabajo' }
};

function buildSeo(
	contentKey: string,
	slug: string,
	content: LearnPageContent
): LearnPageSeo {
	const canonical = `${BASE_URL}/learn/${slug}/`;
	const description = content.answerBlock.slice(0, 155);
	const pillar = contentKey.split('/')[0];
	const ogImage = `${OG_IMAGE_BASE}/${PILLAR_OG[pillar] || 'learn-hub'}.png`;
	const lastUpdated = new Date().toISOString().split('T')[0];

	const breadcrumbItems = [
		{ '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
		{ '@type': 'ListItem', position: 2, name: 'Learn', item: `${BASE_URL}/learn/` }
	];
	if (BREADCRUMB_LABELS[pillar]) {
		breadcrumbItems.push({
			'@type': 'ListItem',
			position: 3,
			name: BREADCRUMB_LABELS[pillar].en,
			item: `${BASE_URL}/learn/${pillar}/`
		});
		breadcrumbItems.push({
			'@type': 'ListItem',
			position: 4,
			name: content.hero.title,
			item: canonical
		});
	} else {
		breadcrumbItems.push({
			'@type': 'ListItem',
			position: 3,
			name: content.hero.title,
			item: canonical
		});
	}

	const jsonLd: Record<string, unknown>[] = [
		{
			'@context': 'https://schema.org',
			'@type': 'Article',
			headline: content.hero.title,
			description,
			url: canonical,
			image: ogImage,
			inLanguage: 'en',
			author: { '@type': 'Organization', name: 'BitTasker', url: BASE_URL },
			publisher: {
				'@type': 'Organization',
				name: 'BitTasker',
				url: BASE_URL,
				logo: { '@type': 'ImageObject', url: `${BASE_URL}/images/logos/bittasker-logomark-og.webp` }
			},
			mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
			datePublished: lastUpdated,
			dateModified: lastUpdated
		},
		{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems }
	];

	if (content.faq.length > 0) {
		jsonLd.push({
			'@context': 'https://schema.org',
			'@type': 'FAQPage',
			mainEntity: content.faq.map((item) => ({
				'@type': 'Question',
				name: item.question,
				acceptedAnswer: { '@type': 'Answer', text: item.answer }
			}))
		});
	}

	return {
		title: content.hero.title,
		description,
		canonical,
		keywords: '',
		ogTitle: content.hero.title,
		ogDescription: description,
		ogImage,
		twitterTitle: content.hero.title,
		twitterDescription: description,
		jsonLd,
		hreflangLinks: getHreflangLinks(contentKey, BASE_URL)
	};
}

export const load = async ({ params }: Parameters<PageLoad>[0]) => {
	const slug = (params.slug || '').replace(/\/+$/, '');

	const contentKey = resolveContentKey('en', slug);
	if (!contentKey) {
		throw error(404, { message: `Learn page not found: /learn/${slug}` });
	}

	// Load English content (always available for prerendering)
	const enImport = enContentMap[contentKey];
	if (!enImport) {
		throw error(404, { message: `Content not found for: ${contentKey}` });
	}
	const enContent = (await enImport()).content;
	const enSeo = buildSeo(contentKey, slug, enContent);

	// Load Spanish content (may not exist for all pages)
	let esContent: LearnPageContent | null = null;
	const esImport = esContentMap[contentKey];
	if (esImport) {
		try {
			esContent = (await esImport()).content;
		} catch {
			// Spanish content not available — fall back to English
		}
	}

	return {
		content: enContent,
		seo: enSeo,
		locale: 'en',
		contentKey,
		lastUpdated: new Date().toISOString().split('T')[0],
		// Spanish content passed for client-side language switching
		esContent
	};
};
