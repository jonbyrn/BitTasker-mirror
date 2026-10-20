export const prerender = true;
export const ssr = true;

export async function load({ url }) {
	return {
		title: 'Learn — BitTasker Guides & Resources',
		description:
			'Free guides on Bitcoin wallets, freelancing platforms, Lightning payments, crypto security, and more. Learn how to earn, save, and spend Bitcoin on BitTasker.',
		canonical: url.href,
		ogTitle: 'Learn — BitTasker Guides & Resources',
		ogDescription:
			'Free guides on Bitcoin wallets, freelancing platforms, Lightning payments, crypto security, and more.',
		twitterTitle: 'Learn — BitTasker Guides & Resources',
		twitterDescription:
			'Free guides on Bitcoin wallets, freelancing platforms, Lightning payments, crypto security, and more.'
	};
}
