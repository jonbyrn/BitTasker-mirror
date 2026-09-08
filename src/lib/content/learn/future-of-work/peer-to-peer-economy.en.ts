import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Peer-to-Peer Economy: Direct Work Without Middlemen',
		subtitle:
			'How Bitcoin and decentralized platforms are cutting out intermediaries from hiring, payments, and escrow.'
	},
	answerBlock:
		'The peer-to-peer (P2P) economy is a system where individuals transact directly with each other — without banks, payment processors, or platform intermediaries extracting fees and controlling access. Bitcoin is P2P money: payments go directly from client wallet to freelancer wallet over the Lightning Network in seconds. Platforms like BitTasker add P2P infrastructure for job matching and smart-contract escrow on RGB, while keeping the core transaction peer-to-peer. The result: freelancers keep more of their earnings (5–10% vs. 20%), get paid instantly, and reach clients globally without permission from any intermediary.',
	sections: [
		{
			heading: 'What is the peer-to-peer economy?',
			body: 'The peer-to-peer economy is economic activity between individuals without centralized intermediaries. In traditional models, a bank processes your payment, a platform matches you to a client and takes a cut, and a payment processor handles settlement. Each intermediary adds fees, delays, and control points. In a P2P model, the freelancer and client connect directly, agree on terms, and transact using Bitcoin. No bank delays, no platform holding your funds, no payment processor taking 3%. The P2P economy is not new — Craigslist, local marketplaces, and cash transactions have always been peer-to-peer. Bitcoin formalizes this at global scale with cryptographic guarantees.'
		},
		{
			heading: 'How does Bitcoin enable peer-to-peer work?',
			body: "Bitcoin was designed as peer-to-peer electronic cash. The Lightning Network extends this to instant, low-fee microtransactions ideal for freelancing. A client in Berlin pays a developer in Buenos Aires directly — the satoshis arrive in the freelancer's Lightning wallet within seconds. No bank processes the transfer. No payment gateway holds the funds. No platform delays the payout for 14 days. The transaction is between two wallets, verified by the Bitcoin network. This is what Satoshi Nakamoto described in the 2008 whitepaper: electronic cash without trusted third parties."
		},
		{
			heading: 'What are P2P marketplaces and how do they work?',
			body: 'P2P marketplaces are platforms that facilitate direct transactions between users without controlling the funds or identity layer. BitTasker is a P2P freelance marketplace: it helps freelancers and clients find each other, provides smart-contract escrow on RGB, and supports delivery tracking and dispute resolution. But it does not hold your money (payments are Lightning), does not own your identity (it is Nostr-based), and does not lock your reputation to its servers. Compare this to Upwork, which holds funds in its internal system, owns your account, and can disable your profile at any time. A P2P marketplace is a facilitator, not a gatekeeper.'
		},
		{
			heading: 'What are the benefits of P2P freelancing?',
			body: 'Lower fees: P2P platforms charge 5–10% versus 20% on traditional platforms. Faster settlement: Bitcoin Lightning payments arrive in seconds, not 14+ days. Global reach: anyone with an internet connection and a Lightning wallet can participate, regardless of banking infrastructure. No deplatforming risk: Nostr identity and Bitcoin payments are controlled by you, not a company. Currency sovereignty: you receive Bitcoin and decide when and how to convert, avoiding unfavorable exchange rates imposed by platforms. For freelancers in El Salvador, Argentina, Nigeria, or the Philippines, these benefits translate directly into higher effective earnings.'
		},
		{
			heading: 'What other P2P platforms exist besides BitTasker?',
			body: 'The P2P economy extends beyond freelancing. Bisq is a P2P Bitcoin exchange with no central authority. HodlHodl is a P2P Bitcoin lending platform. HodlHodl and Peach Bitcoin enable peer-to-peer Bitcoin purchases. Nostr itself is a P2P communication network. In the gig space, BitTasker is among the first to combine Nostr identity, Bitcoin Lightning payments, and smart-contract escrow into a complete freelancing experience. As the P2P ecosystem matures, expect interoperability: your Nostr identity from BitTasker works on social apps, other marketplaces, and future P2P services.'
		},
		{
			heading: 'How does BitTasker enable the P2P economy for work?',
			body: 'BitTasker strips out the intermediaries that traditional platforms impose. Identity is yours (Nostr). Payments are direct (Lightning). Escrow is trustless (RGB smart contracts). The platform provides the tooling — job listings, search, delivery workflows, dispute resolution — but does not sit between you and your money. When a client pays a freelancer on BitTasker, the Bitcoin moves from one wallet to another. No platform account balance. No withdrawal request. No 14-day hold. This is the P2P economy applied to professional work: direct, fast, and controlled by the participants, not the platform.'
		},
		{
			heading: 'What are the challenges of the P2P economy?',
			body: 'The P2P economy faces real challenges. UX friction: setting up wallets, managing keys, and understanding Bitcoin is harder than clicking "Sign up with Google." Discovery: without a centralized platform controlling the marketplace, connecting with clients requires more effort (though BitTasker handles this). Regulatory uncertainty: some governments are still determining how P2P crypto transactions are taxed and regulated. Volatility: Bitcoin\'s price fluctuations affect the fiat value of earnings, though Lightning micropayments and stablecoin bridges reduce this impact. These challenges are real but diminishing as tools mature and user adoption grows.'
		}
	],
	faq: [
		{
			question: 'What does peer-to-peer mean for freelancers?',
			answer:
				"Peer-to-peer means you transact directly with your client without a platform holding your money or controlling your identity. On BitTasker, the client's Bitcoin goes directly to your Lightning wallet. No intermediary delays the payment or takes an additional cut beyond the platform fee."
		},
		{
			question: 'How is a P2P marketplace different from Upwork or Fiverr?',
			answer:
				'Upwork and Fiverr are centralized platforms that control your account, hold your earnings, and set the rules. A P2P marketplace like BitTasker facilitates the connection but uses decentralized infrastructure — Nostr for identity, Bitcoin Lightning for payments, and smart contracts for escrow. The platform does not hold your funds or own your reputation.'
		},
		{
			question: 'Do P2P platforms have customer support?',
			answer:
				"BitTasker provides dispute resolution and support workflows while keeping the underlying infrastructure decentralized. You have access to help when you need it, but your funds and identity are not dependent on the support team's availability. This is the balance: usability without custody."
		},
		{
			question: 'Is the P2P economy safe?',
			answer:
				'Safety in the P2P economy comes from cryptographic guarantees rather than corporate trust. Bitcoin payments are irreversible and verifiable on-chain. Nostr identity is signed with your private key. RGB escrow contracts are auditable. The risk shifts from "trusting a company" to "securing your own keys" — a different kind of responsibility, but one that gives you more control.'
		},
		{
			question: 'Can I earn fiat currency on a P2P platform?',
			answer:
				"BitTasker pays in Bitcoin via Lightning. You can convert to fiat instantly using exchanges or payment services. Many freelancers in Latin America prefer receiving Bitcoin because it avoids expensive bank transfers and unfavorable exchange rates. The choice of when and how to convert is yours — not a platform's."
		},
		{
			question: 'How do I start with the P2P economy as a freelancer?',
			answer:
				'Set up a Lightning wallet (Aqua, Blink, or Wallet of Satoshi), create a BitTasker account with a Nostr identity, and start browsing or posting jobs. The technical barrier is lower than it looks — if you can use Venmo, you can learn Lightning payments in about 10 minutes.'
		}
	],
	bitTaskerCta: {
		heading: 'Cut out the middlemen. Keep your earnings.',
		body: 'BitTasker is the peer-to-peer freelancing platform where you transact directly with clients using Bitcoin Lightning. No platform custody, no delayed payouts, no gatekeepers.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
