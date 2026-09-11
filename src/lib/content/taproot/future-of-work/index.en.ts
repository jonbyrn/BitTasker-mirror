import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'The Future of Work Is Decentralized',
		subtitle:
			'Decentralized labor, gig economy, Nostr, censorship resistance, and P2P — the work revolution explained.'
	},
	answerBlock:
		"The future of work is decentralized, peer-to-peer, and censorship-resistant. Instead of platforms controlling your identity, holding your earnings, and deciding your fate, the new model gives workers sovereignty: Nostr for portable identity, Bitcoin Lightning for instant payments, and smart contracts for trustless agreements. This guide covers the full landscape of decentralized labor — from the gig economy's evolution to Nostr-powered marketplaces, from censorship-resistant work to the peer-to-peer economy. Whether you are a freelancer, a hiring manager, or simply curious about where work is heading, this is your comprehensive reference.",
	sections: [
		{
			heading: 'What is decentralized labor?',
			body: 'Decentralized labor is work where no single authority controls your identity, payments, or professional reputation. Instead of relying on platforms like Upwork or Fiverr to hold your earnings and vouch for your skills, decentralized work uses Bitcoin for instant peer-to-peer payments and Nostr for portable, censorship-resistant identity. Smart contracts on Bitcoin sidechains like RGB replace traditional escrow with trustless, auditable agreements. The result is a global labor market where freelancers in El Salvador, Nigeria, or Argentina can work for anyone, get paid in seconds, and never lose their reputation to a platform ban. Our decentralized labor guide explains the full architecture and benefits.'
		},
		{
			heading: 'How is the gig economy evolving in 2026?',
			body: 'The gig economy is splitting into two tracks. Track 1: centralized platforms (Upwork, Fiverr, Uber) continue to extract 10–20% in fees, hold worker funds for 14 days, and control identity and reputation. Track 2: decentralized platforms (BitTasker, Nostr-based marketplaces) charge 5% or less, pay instantly via Lightning, and give workers portable identity through Nostr. The decentralized track is growing as Bitcoin adoption expands, Lightning matures, and workers realize they can own their professional reputation. In 2026, the gig economy is no longer just about platform work — it is about worker sovereignty. Our gig economy guide covers every trend and platform.'
		},
		{
			heading: 'What is the Nostr marketplace?',
			body: 'The Nostr marketplace is a decentralized professional network built on the Nostr protocol. Instead of a company controlling your profile, reviews, and connections, your identity is a cryptographic keypair you own. Your reputation travels with you across every compatible platform. Marketplaces built on Nostr — like BitTasker for freelancing — let you find work, complete projects, and build a reputation that no company can take away. The Nostr marketplace is censorship-resistant: no platform can deplatform you, freeze your account, or erase your years of reviews. It is the professional network equivalent of owning your own data. Our Nostr marketplace guide explains how to get started.'
		},
		{
			heading: 'What is censorship-resistant work?',
			body: 'Censorship-resistant work means no platform can prevent you from earning, connecting with clients, or building your professional reputation. Traditional platforms can suspend your account, freeze your funds, or ban you for reasons you cannot appeal. Decentralized work uses Nostr for identity (no central database to hack or censor), Bitcoin Lightning for payments (no intermediary to freeze transactions), and smart contracts for agreements (no company to unilaterally enforce terms). For freelancers in countries with capital controls, political instability, or authoritarian governments, censorship resistance is not a feature — it is a necessity. Our censorship-resistant work guide covers the tools and strategies.'
		},
		{
			heading: 'What is the peer-to-peer economy?',
			body: "The peer-to-peer economy is economic activity between individuals without intermediaries. In freelancing, this means a client in New York directly pays a developer in Buenos Aires — no bank, no payment processor, no platform taking a cut. Bitcoin's Lightning Network makes P2P payments instant and nearly free. Smart contracts on RGB make P2P agreements trustless and auditable. Nostr makes P2P identity portable and censorship-resistant. The P2P economy is not theoretical — it is operating at scale in El Salvador, across Latin America, and in crypto-native communities worldwide. The infrastructure exists; adoption is accelerating. Our P2P economy guide covers the full landscape."
		},
		{
			heading: 'How does BitTasker fit into the future of work?',
			body: "BitTasker combines the three pillars of decentralized work into one platform. Identity: Nostr keypair — your public key is your account, your reputation is cryptographically signed and portable. Payments: Bitcoin Lightning — instant, low-fee settlement, no bank required. Escrow: RGB smart contracts — trustless, on-chain agreements secured by Bitcoin's hash rate. BitTasker handles the UX layer — job matching, delivery tracking, dispute workflows — while keeping the underlying infrastructure decentralized. The result is a platform that feels as easy as Upwork but gives you the sovereignty of working peer-to-peer. In the future of work, BitTasker is where decentralized labor meets practical usability."
		}
	],
	faq: [
		{
			question: 'Is decentralized labor the same as freelancing?',
			answer:
				'Decentralized labor is a type of freelancing where you own your identity, payments, and reputation. Traditional freelancing has platforms controlling everything. Decentralized labor uses Nostr, Bitcoin Lightning, and smart contracts to give workers sovereignty.'
		},
		{
			question: 'Do I need to understand Bitcoin for decentralized work?',
			answer:
				'You need basic familiarity: how to set up a Lightning wallet (10 minutes), how to receive a Lightning invoice, and how to back up your Nostr private key. You do not need to understand mining, consensus, or protocol details.'
		},
		{
			question: 'What happens to my reputation if a platform shuts down?',
			answer:
				'With Nostr identity, your reputation is signed with your private key and stored on decentralized relays. If any platform disappears, your reputation data persists and can be imported into any compatible platform.'
		},
		{
			question: 'Is decentralized work legal?',
			answer:
				'Receiving payment in Bitcoin is legal in most jurisdictions. Tax obligations apply — you must report income regardless of the payment method. Consult a tax professional in your jurisdiction.'
		},
		{
			question: 'How do disputes work without a central authority?',
			answer:
				"BitTasker uses RGB smart contracts for escrow. Disputes follow transparent rules coded into the contract. Funds are locked in code, not held by BitTasker. Resolution is determined by the contract's predefined logic."
		},
		{
			question: 'Can I earn in stablecoins instead of Bitcoin?',
			answer:
				'BitTasker focuses on Bitcoin and Lightning payments. You can receive in sats and convert to stablecoins via integrated swap features. Some freelancers hold BTC as long-term savings while converting the rest.'
		},
		{
			question: 'What are the risks of decentralized work?',
			answer:
				'Bitcoin price volatility, learning curve for wallets and Nostr, regulatory uncertainty in some jurisdictions, and a smaller job market compared to traditional platforms. These are manageable with proper preparation.'
		}
	],
	bitTaskerCta: {
		heading: 'Own Your Work. Own Your Identity. Get Paid in Bitcoin.',
		body: 'BitTasker is the decentralized freelancing platform built on Nostr identity, Bitcoin Lightning payments, and RGB smart contracts. No gatekeepers, no frozen accounts, no 14-day payouts.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
