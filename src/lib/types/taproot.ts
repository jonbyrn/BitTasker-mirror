/**
 * Content type definitions for the /learn/ SEO content section.
 * Each learn page exports a LearnPageContent object from locale-specific files.
 */

/** A single FAQ item with question and answer */
export interface LearnFaqItem {
	question: string;
	answer: string;
}

/** A content section with heading and body */
export interface LearnSection {
	heading: string;
	body: string;
}

/** CTA block that ties the content back to BitTasker */
export interface LearnCta {
	heading: string;
	body: string;
	buttonText: string;
	buttonHref: string;
}

/** A single step in a HowTo schema */
export interface HowToStep {
	name: string;
	text: string;
	image?: string;
}

/** HowTo data for pages that describe step-by-step processes */
export interface LearnHowTo {
	name: string;
	description: string;
	steps: HowToStep[];
	totalTime?: string; // ISO 8601 duration, e.g. "PT15M"
	estimatedCost?: {
		currency: string;
		value: string;
	};
}

/** Product data for hardware wallet review pages */
export interface LearnProduct {
	name: string;
	description: string;
	brand: string;
	image: string;
	url: string;
	offers: {
		price: string;
		priceCurrency: string;
		availability: string; // e.g. "https://schema.org/InStock"
		url?: string;
	};
	review?: {
		reviewRating: {
			ratingValue: string;
			bestRating: string;
		};
		author: {
			'@type': string;
			name: string;
		};
		reviewBody: string;
	};
}

/** Full page content for a learn page — exported from *.en.ts / *.es.ts files */
export interface LearnPageContent {
	hero: {
		title: string;
		subtitle: string;
	};
	answerBlock: string;
	sections: LearnSection[];
	faq: LearnFaqItem[];
	bitTaskerCta: LearnCta;
	/** Optional HowTo schema data for step-by-step guides */
	howTo?: LearnHowTo;
	/** Optional Product schema data for hardware wallet reviews */
	product?: LearnProduct | LearnProduct[];
}

/** SEO metadata derived from content + locale */
export interface LearnPageSeo {
	title: string;
	description: string;
	canonical: string;
	keywords: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	twitterTitle: string;
	twitterDescription: string;
	jsonLd: Array<Record<string, unknown>>;
	hreflangLinks: Array<{ lang: string; href: string }>;
}

/** Combined data returned from +page.ts load function */
export interface LearnPageData {
	content: LearnPageContent;
	seo: LearnPageSeo;
	locale: 'en' | 'es';
	contentKey: string;
	lastUpdated: string;
	/** Spanish content for client-side language switching (null if not available) */
	esContent?: LearnPageContent | null;
}
