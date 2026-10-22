export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');
	const description = 'No open roles right now. Write to us at admin@bittasker.com.';

	return {
		title: 'Careers at BitTasker - Bitcoin Jobs | Remote Opportunities',
		description,
		keywords: 'BitTasker careers, admin@bittasker.com',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Careers at BitTasker',
		ogDescription: description,
		twitterTitle: 'Careers at BitTasker',
		twitterDescription: description,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebPage',
			name: 'Careers at BitTasker',
			description,
			url: `${baseUrl}${url.pathname}`
		}
	};
}
