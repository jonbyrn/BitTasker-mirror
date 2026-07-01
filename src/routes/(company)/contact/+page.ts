export async function load({ url }) {
	const baseUrl = (import.meta.env.VITE_CLIENT_URL || 'https://bittasker.com').replace(/\/$/, '');

	return {
		title: 'Contact BitTasker - Support & Partnership Inquiries',
		description: 'Get in touch with BitTasker for support, partnership opportunities, or general inquiries. Contact our team for help with our Bitcoin task marketplace.',
		keywords: 'contact BitTasker, customer support, partnership inquiries, Bitcoin marketplace support, task platform help, cryptocurrency support',
		canonical: `${baseUrl}${url.pathname}`,
		ogTitle: 'Contact BitTasker - Support & Partnership Inquiries',
		ogDescription: 'Need help with BitTasker? Contact our support team for assistance with our Bitcoin task marketplace platform.',
		twitterTitle: 'Contact BitTasker Support Team',
		twitterDescription: "Get help with BitTasker's Bitcoin task marketplace. Contact our support team for assistance.",
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'ContactPage',
			name: 'Contact BitTasker',
			description: 'Get in touch with BitTasker for support, partnership opportunities, or general inquiries.',
			url: `${baseUrl}${url.pathname}`
		}
	};
}
