import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Payments & Technology Explained',
		subtitle:
			'Lightning Network, smart contracts, Nostr identity, comparisons, and stablecoins — the complete reference.'
	},
	answerBlock:
		'Bitcoin is more than digital money — it is a global payment network, a programmable money layer, and the foundation for decentralized identity. This guide covers the Bitcoin ecosystem as it relates to freelancers and builders: Lightning Network for instant payments, smart contracts for programmable escrow, Nostr for decentralized identity, Bitcoin vs. Ethereum comparisons, and stablecoins for dollar-denominated stability. Whether you are earning your first Bitcoin or building on the protocol, this is your complete reference for understanding how Bitcoin powers the modern freelance economy.',
	sections: [
		{
			heading: 'What is the Lightning Network?',
			body: "The Lightning Network is a Layer 2 payment protocol built on Bitcoin that enables instant, near-zero-fee transactions. Instead of settling every payment on Bitcoin's main chain — which takes 10+ minutes and costs variable fees — Lightning creates off-chain payment channels between participants. Payments route through a network of these channels, arriving in milliseconds for fractions of a cent. For freelancers, Lightning means receiving payment the moment work is approved, without waiting for blockchain confirmations. Lightning has proven its viability at national scale in El Salvador and is now the standard for Bitcoin micropayments worldwide. Our Lightning Network guide explains channels, routing, wallets, and real-world adoption in depth."
		},
		{
			heading: 'Bitcoin smart contracts: what are they?',
			body: "Smart contracts on Bitcoin enable programmable money — self-executing agreements where the terms are written in code. Unlike Ethereum's account model, Bitcoin's UTXO model requires layer-2 solutions for complex smart contracts. Rootstock (RSK) brings full EVM compatibility to Bitcoin, allowing Solidity smart contracts secured by Bitcoin's hash rate through merged mining. Other approaches include Stacks (Clarity language, sBTC), Ordinals and inscriptions (Bitcoin-native NFTs), and OP_CAT-based scripting. For freelancers, smart contracts power trustless escrow: funds are locked in code until work is approved, eliminating the need for a trusted intermediary. Our smart contracts guide covers every approach in detail."
		},
		{
			heading: 'What is Nostr identity for freelancers?',
			body: "Nostr (Notes and Other Stuff Transmitted by Relays) gives freelancers a cryptographic identity that no platform owns. Your public key is your username across every Nostr-enabled service. Your reputation — reviews, completed jobs, portfolio — travels with you because it is signed with your private key, not stored in a company's database. If BitTasker shut down tomorrow, your Nostr identity and all your signed reputation data would still exist on relays and could be imported into any compatible platform. This is fundamentally different from Upwork, where your years of reviews vanish the moment your account is suspended. Nostr identity means you own your professional reputation forever. Our Nostr identity guide explains how to set up and use your Nostr keypair."
		},
		{
			heading: 'Bitcoin vs. Ethereum: what are the differences?',
			body: "Bitcoin and Ethereum are the two largest cryptocurrencies, built for different purposes. Bitcoin is a decentralized store of value and payment network — its security comes from the largest Proof of Work hash rate in existence, and its design prioritizes simplicity, security, and decentralization. Ethereum is a programmable smart contract platform — its security comes from Proof of Stake, and its design prioritizes flexibility and developer tooling. For freelancers: Bitcoin's Lightning Network is the fastest payment rail; Ethereum has a larger DeFi ecosystem but higher fees. Rootstock bridges the gap by bringing EVM smart contracts to Bitcoin. Our Bitcoin vs. Ethereum comparison covers every dimension in detail."
		},
		{
			heading: 'What are stablecoins on Bitcoin?',
			body: "Stablecoins are cryptocurrencies pegged to a stable asset — typically the US dollar. On Bitcoin, stablecoins exist through sidechains and Layer 2 solutions. Rootstock hosts USDC and MoneyOnChain's USD stablecoins (DOC, rDOC) backed by Bitcoin. Liquid Network supports Tether USDt with confidential transactions. Stablecoins give freelancers the best of both worlds: Bitcoin's payment rail with dollar stability. A freelancer in Argentina can receive a stablecoin payment, avoiding peso devaluation, while still using the Lightning Network for fast, cheap transfers. Our stablecoins guide covers every Bitcoin-native stablecoin option."
		},
		{
			heading: 'How does BitTasker use the Bitcoin ecosystem?',
			body: "BitTasker combines four Bitcoin ecosystem technologies into one freelancing platform. Lightning Network for instant, low-fee payouts. Rootstock smart contracts for trustless escrow. Nostr for portable, censorship-resistant identity. And multi-chain support for stablecoin escrow. When a client funds a project, the payment goes into a Rootstock smart contract. When the freelancer completes the work, Lightning delivers payment to their wallet in seconds. The freelancer's reputation is a Nostr keypair they own — portable across platforms. This integration means freelancers get the benefits of the entire Bitcoin ecosystem without needing to understand each technology individually."
		}
	],
	faq: [
		{
			question: 'What is Bitcoin used for besides payments?',
			answer:
				'Bitcoin supports smart contracts (through Rootstock, Stacks), decentralized identity (Nostr), stablecoins (USDC on Rootstock, DOC on MoneyOnChain), NFTs (Ordinals), and programmable escrow. It is evolving from a payment network into a full programmable money layer.'
		},
		{
			question: 'Is Lightning Network the same as Bitcoin?',
			answer:
				'Lightning is a Layer 2 protocol built on top of Bitcoin. It uses Bitcoin for settlement but processes transactions off-chain for instant speed and near-zero fees. Lightning is not a separate cryptocurrency — it is Bitcoin operating on a faster layer.'
		},
		{
			question: 'What is the difference between Bitcoin and Ethereum?',
			answer:
				"Bitcoin prioritizes security, decentralization, and store of value. Ethereum prioritizes smart contract flexibility and developer tooling. Bitcoin uses Proof of Work; Ethereum uses Proof of Stake. Bitcoin's Lightning Network is faster for payments; Ethereum has more DeFi protocols."
		},
		{
			question: 'Do I need to understand all this to use BitTasker?',
			answer:
				'No. BitTasker handles the technical complexity. You need a Lightning wallet to receive payments and a basic understanding of Bitcoin. The platform manages escrow, identity, and payment routing behind the scenes.'
		},
		{
			question: 'Are stablecoins on Bitcoin safe?',
			answer:
				"Stablecoins on Bitcoin sidechains (like USDC on Rootstock) are backed by reserves and secured by the sidechain's consensus mechanism. Rootstock is merged-mined with Bitcoin for security. Always verify the backing and auditing of any stablecoin before using it."
		},
		{
			question: 'What is Nostr and why does it matter?',
			answer:
				'Nostr is a decentralized protocol for identity and communication. It gives you a cryptographic keypair that works across every compatible platform. Your reputation, identity, and data are portable — no single company can lock you out.'
		},
		{
			question: 'Can I use BitTasker with Ethereum?',
			answer:
				'BitTasker uses Rootstock (a Bitcoin sidechain with EVM compatibility) for smart contracts. MetaMask and other Ethereum-compatible wallets work with Rootstock. You do not need to use Ethereum directly.'
		}
	],
	bitTaskerCta: {
		heading: 'Experience the Full Bitcoin Stack',
		body: 'Lightning payments, Rootstock escrow, Nostr identity — BitTasker brings the best of the Bitcoin ecosystem to freelancing. Start earning today.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
