// Global SEO and JSON-LD constants for BitTasker company pages

export const BITTASKER_ORG_JSONLD = {
  '@type': 'Organization',
  name: 'BitTasker',
  description: 'BitTasker exists to empower everyday people to earn, trade, and thrive—without borders, banks, or barriers. We are building a platform where skills become currency, and Bitcoin becomes the bridge between sovereign individuals.',
  url: 'https://bittasker.com',
  logo: 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg',
  sameAs: [
    'https://twitter.com/BitTaskerdotcom',
    'https://www.linkedin.com/company/bittasker',
    'https://www.facebook.com/BitTaskerdotcom/'
  ],
  founder: {
    '@type': 'Person',
    name: 'BitTasker Team'
  },
  foundingDate: '2024',
  industry: 'Technology'
};

export const BITTASKER_WEBSITE_JSONLD = {
  '@type': 'WebSite',
  name: 'BitTasker',
  url: 'https://bittasker.com'
};

export const BITTASKER_LOGO = 'https://bittasker.com/images/Bittasker-logo-tagline-dark.svg';
export const BITTASKER_CANONICAL_BASE = 'https://bittasker.com';
export const BITTASKER_SOCIAL_LINKS = [
  'https://twitter.com/BitTaskerdotcom',
  'https://www.linkedin.com/company/bittasker',
  'https://www.facebook.com/BitTaskerdotcom/'
];

export const BITTASKER_SITE_NAVIGATION_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SiteNavigationElement',
  'name': 'Main Navigation',
  'url': [
    'https://bittasker.com/',
    'https://bittasker.com/browse',
    'https://bittasker.com/post-task',
    'https://bittasker.com/company',
    'https://bittasker.com/login'
  ]
};
