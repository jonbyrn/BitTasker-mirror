import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Decentralized Labor: The Future of Work Without Bosses',
		subtitle:
			'How Bitcoin and Nostr are enabling a new economy where workers own their identity, payments, and reputation.'
	},
	answerBlock:
		'Decentralized labor is work where no single authority controls your identity, payments, or professional reputation. Instead of relying on platforms like Upwork or Fiverr to hold your earnings and vouch for your skills, decentralized work uses Bitcoin for instant peer-to-peer payments and Nostr for portable, censorship-resistant identity. Smart contracts on Bitcoin sidechains like RGB replace traditional escrow with trustless, auditable agreements. The result is a global labor market where freelancers in El Salvador, Nigeria, or Argentina can work for anyone, get paid in seconds, and never lose their reputation to a platform ban.',
	sections: [
		{
			heading: 'What is decentralized work?',
			body: 'Decentralized work is freelancing without a central gatekeeper. In traditional gig platforms, the company controls your account, holds your funds in escrow, decides your fee structure, and can ban you at any time. In a decentralized model, workers use cryptographic keys for identity (Nostr), receive payments directly over the Bitcoin Lightning Network, and participate in smart-contract escrow on sidechains like RGB. No single entity can freeze your earnings, erase your reputation, or shut you out of the marketplace.'
		},
		{
			heading: 'How does decentralized identity work for freelancers?',
			body: "Nostr (Notes and Other Stuff Transmitted by Relays) gives freelancers a cryptographic identity that no platform owns. Your public key is your username across every Nostr-enabled service. Your reputation — reviews, completed jobs, portfolio — travels with you because it is signed with your private key, not stored in a company's database. If BitTasker shut down tomorrow, your Nostr identity and all your signed reputation data would still exist on relays and could be imported into any compatible platform. This is fundamentally different from Upwork, where your years of reviews vanish the moment your account is suspended."
		},
		{
			heading: 'How does Bitcoin enable decentralized payments?',
			body: "Bitcoin's Lightning Network lets freelancers receive payment in seconds with near-zero fees — no bank account, no payment processor, no 14-day holding period. A client in New York pays a developer in San Salvador, and the satoshis arrive before the project delivery confirmation email is even read. There is no intermediary that can freeze the transaction, reverse it, or demand a cut beyond what both parties agreed to. For freelancers in countries with capital controls, unstable currencies, or limited banking infrastructure, Lightning payments are not just convenient — they are transformative."
		},
		{
			heading: 'What is trustless escrow and why does it matter?',
			body: "Traditional escrow means trusting a platform to hold your money fairly. Trustless escrow uses smart contracts on a Bitcoin sidechain (like RGB) where funds are locked in code, not in a company's bank account. Both the freelancer and client can verify the contract's terms on-chain. Dispute resolution follows transparent rules written into the contract. Neither party needs to trust BitTasker or any other company — they trust auditable code. This eliminates the risk of a platform arbitrarily siding with one party or holding funds during a dispute."
		},
		{
			heading: 'What are the benefits of decentralized labor?',
			body: 'The core benefits are: global open access (anyone with an internet connection can participate), censorship resistance (no platform can deplatform you), instant settlement (Lightning payments in seconds vs. 14-day Net terms), lower fees (5–10% on BitTasker vs. 20% on Upwork), and portable reputation (your Nostr identity travels with you across platforms). For freelancers in emerging markets — Latin America, Africa, Southeast Asia — decentralized labor removes banking friction and high remittance costs that eat into earnings.'
		},
		{
			heading: 'What are the challenges of decentralized work?',
			body: 'Decentralized work has real trade-offs. Bitcoin price volatility means your earnings can fluctuate in fiat terms — though Lightning payments in sats and stablecoin bridges reduce this risk. There is a learning curve: setting up a Lightning wallet, understanding Nostr keys, and navigating smart contracts requires more technical knowledge than signing up for Fiverr. Regulatory uncertainty persists — some jurisdictions are unclear about how crypto payments are taxed. And the ecosystem is still maturing: fewer clients, smaller job markets, and less polished UX compared to established platforms.'
		},
		{
			heading: 'How does BitTasker implement decentralized labor?',
			body: 'BitTasker combines three pillars of decentralized work into one platform. Identity is built on Nostr — your public key is your account, and your reputation is cryptographically signed and portable. Payments run on the Bitcoin Lightning Network for instant, low-fee settlement. Escrow uses RGB smart contracts for trustless, on-chain agreements. BitTasker handles the UX layer — job matching, delivery tracking, dispute workflows — while keeping the underlying infrastructure decentralized. The result is a platform that feels as easy as Upwork but gives you the sovereignty of working peer-to-peer.'
		}
	],
	faq: [
		{
			question: 'Is decentralized labor the same as freelancing?',
			answer:
				'Decentralized labor is a type of freelancing, but the key difference is who controls the infrastructure. In traditional freelancing, platforms like Upwork or Fiverr control your identity, hold your funds, and set the rules. In decentralized labor, you own your identity through Nostr, receive Bitcoin payments directly via Lightning, and participate in trustless smart-contract escrow. The work itself — writing code, designing logos, translating documents — is the same. The power structure is different.'
		},
		{
			question: 'Do I need to understand Bitcoin to do decentralized work?',
			answer:
				'You need basic familiarity: how to set up a Lightning wallet (takes about 10 minutes), how to receive a Lightning invoice, and how to back up your Nostr private key. You do not need to understand mining, consensus algorithms, or technical protocol details. If you can use Venmo, you can learn Lightning payments. BitTasker provides onboarding guides to make the transition smooth.'
		},
		{
			question: 'What happens to my reputation if BitTasker shuts down?',
			answer:
				"Because BitTasker uses Nostr for identity, your reputation is signed with your private key and stored across decentralized relays — not in BitTasker's database. If BitTasker disappeared tomorrow, your reputation data would still exist on Nostr relays and could be imported into any compatible platform. This is the fundamental advantage of decentralized identity over platform-locked profiles."
		},
		{
			question: 'Can I earn in stablecoins instead of Bitcoin?',
			answer:
				'BitTasker focuses on Bitcoin and Lightning payments. If you need stablecoin exposure, you can receive in sats and use a swap service to convert. Some freelancers prefer to keep earnings in Bitcoin as a long-term savings strategy, while others convert to local currency immediately. The choice is yours — the key benefit is that no intermediary controls when or how you access your money.'
		},
		{
			question: 'How do disputes work without a central authority?',
			answer:
				"BitTasker uses RGB smart contracts for escrow. When a dispute arises, both parties present evidence within the platform's dispute workflow. Resolution follows transparent rules coded into the smart contract. Funds are never held by BitTasker — they are locked in the contract until both parties agree or the contract's dispute mechanism resolves the issue. This eliminates the risk of platform bias."
		},
		{
			question: 'Is decentralized work legal?',
			answer:
				'Receiving payment in Bitcoin is legal in most jurisdictions. However, tax obligations still apply — you must report income regardless of the payment method. Some countries have specific crypto tax rules; others treat Bitcoin payments like any other income. Always consult a tax professional in your jurisdiction. BitTasker does not provide legal or tax advice.'
		}
	],
	bitTaskerCta: {
		heading: 'Own your work. Own your identity. Get paid in Bitcoin.',
		body: 'BitTasker is the decentralized freelancing platform built on Nostr identity, Bitcoin Lightning payments, and RGB smart contracts. No gatekeepers, no frozen accounts, no 14-day payouts. Your reputation is yours forever.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
