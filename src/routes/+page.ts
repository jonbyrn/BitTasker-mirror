export async function load({ url }) {
	const seo = {
		title: 'BitTasker - Decentralized Bitcoin Task Marketplace | Hire Professionals for Any Task',
		description: 'Connect with skilled professionals for any task. Pay with Bitcoin or fiat. Built on Nostr. Join the decentralized workforce on BitTasker.',
		keywords: 'BitTasker, Bitcoin marketplace, decentralized tasks, cryptocurrency earning, peer-to-peer jobs, Bitcoin Lightning Network, financial freedom, censorship-resistant, task platform, Bitcoin escrow, freelancers, gig economy, Bitcoin payments',
		canonical: url.href,
		ogTitle: 'BitTasker - Decentralized Bitcoin Task Marketplace',
		ogDescription: 'Connect with skilled professionals for any task. Pay with Bitcoin or fiat. Join the decentralized workforce on BitTasker.',
		twitterTitle: 'BitTasker - Decentralized Bitcoin Task Marketplace',
		twitterDescription: 'Connect with skilled professionals for any task. Pay with Bitcoin or fiat. Join the decentralized workforce.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name: 'BitTasker',
			description: 'Decentralized Bitcoin task marketplace connecting task posters with skilled workers',
			url: url.href,
			potentialAction: {
				'@type': 'SearchAction',
				target: 'https://bittasker.com/tasks?search={search_term_string}',
				'query-input': 'required name=search_term_string'
			},
			publisher: {
				'@type': 'Organization',
				name: 'BitTasker',
				logo: {
					'@type': 'ImageObject',
					url: 'https://bittasker.com/logo.svg'
				}
			}
		}
	};

	return {
		seo
	};
}

