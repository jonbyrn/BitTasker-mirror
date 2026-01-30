import type { LoadEvent } from '@sveltejs/kit';

export async function load({ url }: LoadEvent) {
	return {
		title: 'How BitTasker Works - Bitcoin Task Marketplace Guide',
		description: 'Discover how BitTasker connects task posters with skilled workers using Bitcoin and Lightning Network. Learn about our secure escrow system and bidding process.',
		keywords: 'how BitTasker works, Bitcoin task marketplace, decentralized gig economy, Lightning Network payments, task bidding system, Bitcoin escrow, peer-to-peer tasks, cryptocurrency marketplace, blockchain tasks',
		canonical: url.href,
		ogTitle: 'How BitTasker Works - Bitcoin Task Marketplace',
		ogDescription: 'Learn how BitTasker revolutionizes the gig economy with Bitcoin payments, secure escrow, and decentralized task matching. Discover the future of peer-to-peer work.',
		twitterTitle: 'How BitTasker Works - The Bitcoin Gig Economy',
		twitterDescription: 'Discover how BitTasker uses Bitcoin and Lightning Network to create a truly decentralized task marketplace. Learn about our innovative escrow system.',
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'HowTo',
			name: 'How to use BitTasker - Bitcoin Task Marketplace',
			description: 'Step-by-step guide on how to use BitTasker for posting tasks, bidding on work, and completing secure Bitcoin transactions.',
			step: [
				{
					'@type': 'HowToStep',
					name: 'Create Your Account',
					text: 'Sign up for BitTasker using your Bitcoin Lightning wallet or traditional methods.'
				},
				{
					'@type': 'HowToStep',
					name: 'Post a Task or Browse Available Work',
					text: 'Task posters create detailed job descriptions while workers browse and bid on available tasks.'
				},
				{
					'@type': 'HowToStep',
					name: 'Secure Bitcoin Escrow',
					text: 'Funds are held in secure Bitcoin escrow until task completion, protecting both parties.'
				},
				{
					'@type': 'HowToStep',
					name: 'Complete Work and Get Paid',
					text: 'Workers complete tasks and receive instant Bitcoin payments via Lightning Network.'
				}
			]
		}
	};
}
