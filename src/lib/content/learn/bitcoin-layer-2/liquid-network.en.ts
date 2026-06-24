import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Liquid Network: Bitcoin Sidechain for Privacy & Assets',
		subtitle:
			"Blockstream's confidential sidechain for fast, private Bitcoin transactions. Learn about L-BTC, Tether, and asset issuance."
	},
	answerBlock:
		"Liquid Network is a Bitcoin sidechain built by Blockstream that enables fast, confidential transactions and custom asset issuance on top of Bitcoin. It uses L-BTC — a Bitcoin-pegged token — as its native asset, with transactions settling in about 2 minutes. Liquid's key differentiator is confidential transactions: amounts and asset types are hidden from public view while still being verifiable by participants. The network supports Tether USDt for stablecoin payments, security token issuance, and NFTs. Aqua Wallet, a popular Bitcoin wallet, integrates Liquid natively for seamless stablecoin and confidential Bitcoin transactions.",
	sections: [
		{
			heading: 'What is Liquid Network?',
			body: "Liquid Network is a federated sidechain of Bitcoin, launched in 2018 by Blockstream. It runs as a separate blockchain connected to Bitcoin via a two-way peg, where BTC is locked on Bitcoin's main chain and L-BTC is issued on Liquid. Unlike Rootstock or Stacks, Liquid focuses on transaction speed, privacy, and asset issuance rather than general-purpose smart contracts. The network uses a federation of functionaries — a consortium of known entities — to validate transactions and manage the peg. This federated model trades some decentralization for significantly faster block times (~2 minutes) and confidential transaction support."
		},
		{
			heading: 'What are confidential transactions?',
			body: "Confidential transactions are Liquid's signature feature. In standard Bitcoin transactions, the amount being sent is visible to everyone on the blockchain. On Liquid, transaction amounts and the types of assets being transferred are cryptographically hidden. Only the sender and receiver can see the actual values. Third-party observers can verify that no new assets were created (preventing inflation) but cannot determine how much was sent or what type of asset was transferred. This is achieved using Pedersen commitments — a cryptographic technique that encodes values in a way that allows mathematical verification without revealing the underlying numbers."
		},
		{
			heading: 'What is L-BTC?',
			body: "L-BTC (Liquid Bitcoin) is the native asset of the Liquid Network, pegged 1:1 to BTC. Users lock BTC on Bitcoin's main chain through the federation, and equivalent L-BTC is issued on Liquid. The reverse process burns L-BTC and releases BTC. L-BTC has all the properties of Bitcoin — it's scarce, transferable, and can be used as money — but with faster transactions (~2 minute confirmations) and confidential amounts. L-BTC is used for trading on Liquid-based exchanges, sending private payments, and as collateral for assets issued on the Liquid Network."
		},
		{
			heading: 'How does Tether work on Liquid?',
			body: 'Tether (USDt) was one of the first tokens issued on Liquid Network. Tether on Liquid benefits from confidential transactions — the amount of USDt in a transfer is hidden from public view. This makes Liquid-based USDt attractive for privacy-conscious users and businesses. Transactions are also faster and cheaper than on Ethereum, with ~2 minute confirmations and minimal fees. Tether on Liquid can be moved between Liquid-enabled wallets and exchanges, providing a stablecoin option that combines price stability with transaction privacy.'
		},
		{
			heading: 'How does asset issuance work on Liquid?',
			body: "Liquid supports the issuance of custom tokens through its issued assets protocol. Anyone can create tokens on Liquid for various purposes: security tokens for fundraising, loyalty points, membership tokens, NFTs, or any representable asset. The protocol includes built-in features like confidential amounts (token quantities can be hidden), multi-sig support, and recovery mechanisms for lost keys. Liquid's asset issuance is simpler than Ethereum's token standards — no complex smart contracts required, just the built-in issuance protocol. This makes it accessible for businesses that want to tokenize assets without deep blockchain development."
		},
		{
			heading: 'How does Aqua Wallet use Liquid?',
			body: "Aqua Wallet, developed by JAN3, is a Bitcoin wallet that natively supports Liquid Network. Users can hold L-BTC, Tether USDt on Liquid, and other Liquid-issued assets alongside their mainnet BTC in a single wallet. Aqua makes it easy to send and receive confidential transactions, swap between BTC and L-BTC, and use stablecoins for everyday payments. For freelancers and businesses in emerging markets, Aqua's Liquid integration provides access to USD-denominated stablecoins without relying on centralized exchanges or Ethereum gas fees."
		},
		{
			heading: 'How does Liquid Network compare to other Bitcoin Layer 2s?',
			body: "Liquid takes a different approach than other Bitcoin Layer 2s. While Rootstock and Stacks focus on general-purpose smart contracts and DeFi, Liquid specializes in fast, private transactions and asset issuance. Liquid uses a federation model (faster but more centralized) versus Rootstock's merged mining or Stacks' Proof of Transfer. Liquid's confidential transactions are unique — no other Bitcoin Layer 2 offers hidden amounts by default. The tradeoff is that Liquid's federation model requires trusting the functionaries, while Rootstock and Stacks derive security more directly from Bitcoin's consensus mechanism."
		}
	],
	faq: [
		{
			question: 'Is Liquid Network a Bitcoin Layer 2?',
			answer:
				"Liquid is technically a federated sidechain connected to Bitcoin via a two-way peg. It extends Bitcoin's functionality with faster transactions, confidential amounts, and asset issuance. While the technical classification differs from rollup-based Layer 2s, Liquid serves a similar purpose of adding capabilities to Bitcoin."
		},
		{
			question: 'What makes Liquid different from Lightning Network?',
			answer:
				'Lightning is optimized for instant micropayments between two parties. Liquid focuses on confidential transactions, asset issuance, and fast on-chain-like settlements. Lightning requires opening channels; Liquid works like a regular blockchain. They serve complementary purposes — Lightning for payments, Liquid for privacy and assets.'
		},
		{
			question: 'Are Liquid transactions really private?',
			answer:
				'Liquid transactions are confidential — the amounts and asset types are hidden from public view using Pedersen commitments. Only the sender and receiver can see the actual values. However, the transaction graph (who sent to whom) is still visible. True transaction graph privacy requires additional techniques.'
		},
		{
			question: 'How do I get L-BTC?',
			answer:
				"You can get L-BTC by locking BTC through the Liquid federation via exchanges that support Liquid, wallets like Aqua or Blockstream Green, or peer-to-peer. The bridge locks your BTC on Bitcoin's main chain and issues equivalent L-BTC on Liquid."
		},
		{
			question: 'Can I issue my own token on Liquid?',
			answer:
				'Yes. Liquid supports custom token issuance through its built-in issued assets protocol. You can create security tokens, loyalty points, NFTs, or any representable asset. The process is simpler than Ethereum token standards — no complex smart contracts required.'
		},
		{
			question: 'Is Liquid Network decentralized?',
			answer:
				'Liquid uses a federation model — a consortium of known entities validates transactions and manages the peg. This provides faster block times and confidential transactions but is more centralized than Bitcoin mainnet or merged-mined sidechains like Rootstock. The federation members are publicly known and auditable.'
		},
		{
			question: 'How fast are Liquid transactions?',
			answer:
				"Liquid blocks are produced approximately every 2 minutes, making transactions significantly faster than Bitcoin's ~10 minute blocks. For comparison, Lightning is instant but requires channel setup, while Ethereum varies from seconds to minutes depending on congestion."
		}
	],
	bitTaskerCta: {
		heading: 'Pay freelancers privately with Liquid Network',
		body: 'BitTasker integrates Liquid for confidential stablecoin payments. Freelancers can receive USDt on Liquid with hidden amounts, fast settlements, and minimal fees through Aqua Wallet.',
		buttonText: 'Start Private Payments',
		buttonHref: '/auth/signup'
	}
};
