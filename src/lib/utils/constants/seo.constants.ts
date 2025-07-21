// Global SEO and JSON-LD constants for BitTasker company pages

export const BITTASKER_ORG_JSONLD = {
  '@type': 'Organization',
  name: 'BitTasker',
  description: 'BitTasker exists to empower everyday people to earn, trade, and thrive—without borders, banks, or barriers. We are building a platform where skills become currency, and Bitcoin becomes the bridge between sovereign individuals.',
  url: 'https://bittasker.com',
  logo: 'https://bittasker.com/images/Logos/BitTasker-Logo-Icon-light-mode.svg',
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

export const BITTASKER_LOGO = 'https://bittasker.com/images/Logos/BitTasker-Logo-Icon-light-mode.svg';
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
    'https://bittasker.com/how-it-works',
    'https://bittasker.com/security',
    'https://bittasker.com/about',
    'https://bittasker.com/contact',
    'https://bittasker.com/faq',
    'https://bittasker.com/terms',
    'https://bittasker.com/privacy',
    'https://bittasker.com/auth/login',
    'https://bittasker.com/auth/signup',
    'https://bittasker.com/dashboard/find-tasks',
    'https://bittasker.com/dashboard/create-task',
    'https://bittasker.com/tasker-fees',
    'https://bittasker.com/escrow',
    'https://bittasker.com/community-guidelines',
    'https://bittasker.com/taskee-fees',
    'https://bittasker.com/tasker-principles'
  ]
};
