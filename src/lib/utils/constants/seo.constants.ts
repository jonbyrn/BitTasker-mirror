// Global SEO and JSON-LD constants for BitTasker company pages

export const BITTASKER_ORG_JSONLD = {
	'@context': 'https://schema.org',
	'@type': 'Organization',
	name: 'BitTasker',
	legalName: 'BitTasker',
	description:
		'Find help or find work. Pay with dollars or Bitcoin. The payment stays locked until you approve the work.',
	url: 'https://bittasker.com',
	logo: {
		'@type': 'ImageObject',
		url: 'https://bittasker.com/images/logos/bittasker-logomark-og.webp'
	},
	sameAs: [
		'https://x.com/BitTaskerdotcom',
		'https://www.linkedin.com/company/bittasker',
		'https://www.facebook.com/BitTaskerdotcom/',
		'https://instagram.com/bittasker',
		'https://www.youtube.com/@BitTasker',
		'https://github.com/BitTasker'
	],
	contactPoint: {
		'@type': 'ContactPoint',
		contactType: 'Customer Service',
		email: 'hello@bittasker.com',
		url: 'https://bittasker.com/contact',
		availableLanguage: ['en', 'es']
	},
	areaServed: {
		'@type': 'Place',
		name: 'Worldwide'
	},
	knowsAbout: [
		'Bitcoin',
		'Dollar payments',
		'Finding help',
		'Finding work',
		'Gig Economy',
		'Freelance Services'
	],
	founder: {
		'@type': 'Person',
		name: 'BitTasker Team'
	},
	foundingDate: '2025',
	industry: 'Technology'
};

export const BITTASKER_WEBSITE_JSONLD = {
	'@type': 'WebSite',
	name: 'BitTasker',
	url: 'https://bittasker.com'
};

// Homepage WebSite schema generator function
export function generateHomepageWebsiteJsonLd(url: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'BitTasker',
		description:
			'Find help or find work. Pay with dollars or Bitcoin. The payment stays locked until you approve the work.',
		url: url,
		inLanguage: ['en', 'es'],
		copyrightHolder: {
			'@type': 'Organization',
			name: 'BitTasker'
		},
		copyrightYear: '2025',
		potentialAction: {
			'@type': 'SearchAction',
			target: 'https://bittasker.com/tasks?search={search_term_string}',
			'query-input': 'required name=search_term_string'
		},
		publisher: BITTASKER_ORG_JSONLD
	};
}

export const BITTASKER_LOGO = 'https://bittasker.com/images/logos/bittasker-logomark.svg';
export const BITTASKER_CANONICAL_BASE = 'https://bittasker.com';
export const BITTASKER_SOCIAL_LINKS = [
	'https://x.com/BitTaskerdotcom',
	'https://www.linkedin.com/company/bittasker',
	'https://www.facebook.com/BitTaskerdotcom/',
	'https://instagram.com/bittasker',
	'https://www.youtube.com/@BitTasker',
	'https://github.com/BitTasker'
];

export const BITTASKER_SITE_NAVIGATION_JSONLD = {
	'@context': 'https://schema.org',
	'@type': 'SiteNavigationElement',
	name: 'Main Navigation',
	url: [
		'https://bittasker.com/',
		'https://bittasker.com/how-it-works',
		'https://bittasker.com/learn/',
		'https://bittasker.com/security',
		'https://bittasker.com/about',
		'https://bittasker.com/contact',
		'https://bittasker.com/faq',
		'https://bittasker.com/terms',
		'https://bittasker.com/privacy',
		'https://bittasker.com/auth/login',
		'https://bittasker.com/auth/signup',
		'https://bittasker.com/tasks',
		'https://bittasker.com/create-task',
		'https://bittasker.com/tasker-fees',
		'https://bittasker.com/secure-payments',
		'https://bittasker.com/community-guidelines',
		'https://bittasker.com/taskee-fees',
		'https://bittasker.com/tasker-principles'
	]
};
