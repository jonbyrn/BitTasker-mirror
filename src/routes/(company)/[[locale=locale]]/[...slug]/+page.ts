import { error } from '@sveltejs/kit';
import { resolveContentKey, getHreflangLinks, getLocalePrefix } from '$lib/content/learn/slug-map';
import type { PageLoad } from './$types';
import type { LearnPageData } from '$lib/types/learn';

const BASE_URL = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
const OG_IMAGE_BASE = `${BASE_URL}/og-images`;

// Map content key prefixes to pillar OG images
const PILLAR_OG_IMAGES: Record<string, string> = {
	wallet: 'learn-wallet',
	security: 'learn-security',
	freelancing: 'learn-freelancing',
	'bitcoin-freelancing': 'learn-btc-freelancing',
	bitcoin: 'learn-bitcoin',
	rootstock: 'learn-rootstock',
	'bitcoin-layer-2': 'learn-btc-l2',
	'future-of-work': 'learn-future'
};

function getPillarOgImage(contentKey: string): string {
	const pillar = contentKey.split('/')[0];
	return `${OG_IMAGE_BASE}/${PILLAR_OG_IMAGES[pillar] || 'learn-hub'}.png`;
}

// Map content key to breadcrumb labels (localized)
const BREADCRUMB_LABELS: Record<string, { en: string; es: string }> = {
	wallet: { en: 'Wallets', es: 'Billeteras' },
	security: { en: 'Security', es: 'Seguridad' },
	freelancing: { en: 'Freelancing', es: 'Freelance' },
	'bitcoin-freelancing': { en: 'Bitcoin Freelancing', es: 'Freelance Bitcoin' },
	bitcoin: { en: 'Bitcoin', es: 'Bitcoin' },
	rootstock: { en: 'Rootstock', es: 'Rootstock' },
	'bitcoin-layer-2': { en: 'Bitcoin Layer 2', es: 'Bitcoin Capa 2' },
	'future-of-work': { en: 'Future of Work', es: 'Futuro del Trabajo' }
};

export const load: PageLoad = async ({ params }): Promise<LearnPageData> => {
	const pageLocale = params.locale || 'en';
	let slug = params.slug || '';

	// Strip learn/aprende prefix
	if (slug.startsWith('learn/')) {
		slug = slug.slice(6);
	} else if (slug.startsWith('aprende/')) {
		slug = slug.slice(8);
	}

	// Resolve content key from URL slug
	const contentKey = resolveContentKey(pageLocale, slug);
	if (!contentKey) {
		throw error(404, {
			message: `Learn page not found: /${pageLocale === 'es' ? 'aprende' : 'learn'}/${slug}`
		});
	}

	// Load locale-specific content
	let contentModule: { content: LearnPageData['content'] };
	try {
		contentModule = await import(`$lib/content/learn/${contentKey}.${pageLocale}.ts`);
	} catch {
		try {
			contentModule = await import(`$lib/content/learn/${contentKey}.en.ts`);
		} catch {
			throw error(404, {
				message: `Content not found for: ${contentKey} (${pageLocale})`
			});
		}
	}

	const content = contentModule.content;
	const prefix = getLocalePrefix(pageLocale as 'en' | 'es');
	const canonical = `${BASE_URL}/${prefix}/${slug}/`;
	const hreflangLinks = getHreflangLinks(contentKey, BASE_URL);
	const description = content.answerBlock.slice(0, 155);
	const ogImage = getPillarOgImage(contentKey);
	const pillar = contentKey.split('/')[0];
	const locale = pageLocale as 'en' | 'es';
	const lastUpdated = new Date().toISOString().split('T')[0];

	// Build breadcrumb items for JSON-LD
	const breadcrumbItems = [
		{
			'@type': 'ListItem',
			position: 1,
			name: locale === 'es' ? 'Inicio' : 'Home',
			item: `${BASE_URL}/`
		},
		{
			'@type': 'ListItem',
			position: 2,
			name: locale === 'es' ? 'Aprender' : 'Learn',
			item: `${BASE_URL}/learn/`
		}
	];
	if (BREADCRUMB_LABELS[pillar]) {
		breadcrumbItems.push({
			'@type': 'ListItem',
			position: 3,
			name: BREADCRUMB_LABELS[pillar][locale],
			item: `${BASE_URL}/${prefix}/${pillar}/`
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

	// FAQPage schema from content
	const faqSchema =
		content.faq.length > 0
			? {
					'@context': 'https://schema.org',
					'@type': 'FAQPage',
					mainEntity: content.faq.map((item) => ({
						'@type': 'Question',
						name: item.question,
						acceptedAnswer: {
							'@type': 'Answer',
							text: item.answer
						}
					}))
				}
			: null;

	// HowTo schema from content (for step-by-step guides)
	const howToSchema = content.howTo
		? {
				'@context': 'https://schema.org',
				'@type': 'HowTo',
				name: content.howTo.name,
				description: content.howTo.description,
				inLanguage: locale === 'es' ? 'es' : 'en',
				step: content.howTo.steps.map((step, i) => ({
					'@type': 'HowToStep',
					position: i + 1,
					name: step.name,
					text: step.text,
					...(step.image ? { image: step.image } : {})
				})),
				...(content.howTo.totalTime ? { totalTime: content.howTo.totalTime } : {}),
				...(content.howTo.estimatedCost ? { estimatedCost: content.howTo.estimatedCost } : {})
			}
		: null;

	// Product schema from content (for hardware wallet reviews)
	// Supports single product or array of products (comparison pages)
	const productSchemas = content.product
		? (Array.isArray(content.product) ? content.product : [content.product]).map((prod) => ({
				'@context': 'https://schema.org',
				'@type': 'Product',
				name: prod.name,
				description: prod.description,
				brand: {
					'@type': 'Brand',
					name: prod.brand
				},
				image: prod.image,
				url: prod.url,
				offers: {
					'@type': 'Offer',
					price: prod.offers.price,
					priceCurrency: prod.offers.priceCurrency,
					availability: prod.offers.availability,
					...(prod.offers.url ? { url: prod.offers.url } : {})
				},
				...(prod.review
					? {
							review: {
								'@type': 'Review',
								reviewRating: {
									'@type': 'Rating',
									ratingValue: prod.review.reviewRating.ratingValue,
									bestRating: prod.review.reviewRating.bestRating
								},
								author: prod.review.author,
								reviewBody: prod.review.reviewBody
							}
						}
					: {})
			}))
		: [];

	return {
		content,
		seo: {
			title: content.hero.title,
			description,
			canonical,
			keywords: '',
			ogTitle: content.hero.title,
			ogDescription: description,
			ogImage,
			twitterTitle: content.hero.title,
			twitterDescription: description,
			jsonLd: [
				// Article schema (primary)
				{
					'@context': 'https://schema.org',
					'@type': 'Article',
					headline: content.hero.title,
					description,
					url: canonical,
					image: ogImage,
					inLanguage: locale === 'es' ? 'es' : 'en',
					author: {
						'@type': 'Organization',
						name: 'BitTasker',
						url: BASE_URL
					},
					publisher: {
						'@type': 'Organization',
						name: 'BitTasker',
						url: BASE_URL,
						logo: {
							'@type': 'ImageObject',
							url: `${BASE_URL}/images/logos/bittasker-logomark-og.webp`
						}
					},
					mainEntityOfPage: {
						'@type': 'WebPage',
						'@id': canonical
					},
					datePublished: lastUpdated,
					dateModified: lastUpdated
				},
				// BreadcrumbList schema
				{
					'@context': 'https://schema.org',
					'@type': 'BreadcrumbList',
					itemListElement: breadcrumbItems
				},
				// FAQPage schema (if FAQ exists)
				...(faqSchema ? [faqSchema] : []),
				// HowTo schema (if step-by-step data exists)
				...(howToSchema ? [howToSchema] : []),
				// Product schemas (if product data exists — can be single or array)
				...productSchemas
			],
			hreflangLinks
		},
		locale,
		contentKey,
		lastUpdated: new Date().toISOString().split('T')[0]
	};
};
