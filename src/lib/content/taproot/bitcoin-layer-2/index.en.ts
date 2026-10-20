import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Layer 2: Scaling Solutions Compared',
		subtitle:
			'Lightning, Rootstock, Stacks, Liquid, and more — find the right Bitcoin Layer 2 for your use case.'
	},
	answerBlock:
		'Bitcoin Layer 2s are networks built on top of Bitcoin that add capabilities the base chain does not support natively — like smart contracts, faster transactions, privacy features, and token issuance. They settle transactions back to Bitcoin for security while processing activity on their own chains. The main categories are payment channels (Lightning), sidechains (Rootstock, Liquid), and Layer 2s with Bitcoin settlement (Stacks, Merlin, BOB). Each optimizes for different use cases: payments, DeFi, privacy, or asset issuance. This guide compares every major Bitcoin Layer 2, explains how they work, and shows how BitTasker integrates multiple chains for the best freelancing experience.',
	sections: [
		{
			heading: 'What are Bitcoin Layer 2s?',
			body: "Bitcoin Layer 2s are networks built on top of Bitcoin that add capabilities the base chain does not support natively — like smart contracts, faster transactions, privacy features, and token issuance. They settle transactions back to Bitcoin for security while processing activity on their own chains. The main categories are payment channels (Lightning), sidechains (Rootstock, Liquid), and Layer 2s with Bitcoin settlement (Stacks, Merlin, BOB). Each approaches the Bitcoin scalability trilemma differently, trading off between decentralization, speed, and functionality. The key insight: Bitcoin's base layer is designed for security and decentralization, not speed or programmability. Layer 2s add the features needed for a global financial system while inheriting Bitcoin's security model. Our Layer 2 comparison guide provides the full technical breakdown."
		},
		{
			heading: 'How do Bitcoin Layer 2s compare to each other?',
			body: 'Lightning Network — Consensus: Payment channels | TVL: ~$200M | EVM: No | Use case: Instant payments | Speed: Instant | Key feature: Micropayments, lowest fees.\n\nRootstock — Consensus: Merged mining with Bitcoin | TVL: ~$235M | EVM: Yes (full) | Use case: DeFi, escrow, dApps | Speed: ~30 seconds | Key feature: Bitcoin-secured smart contracts, RBTC gas.\n\nStacks — Consensus: Proof of Transfer (PoX) | TVL: ~$500M+ | EVM: No (Clarity) | Use case: DeFi, NFTs, DAOs | Speed: Seconds (post-Nakamoto) | Key feature: sBTC, Clarity language, Bitcoin settlement.\n\nLiquid Network — Consensus: Federation | TVL: ~$180M | EVM: No | Use case: Privacy, asset issuance | Speed: ~2 minutes | Key feature: Confidential transactions, Tether USDt.\n\nMerlin Chain — Consensus: Bitmap + ZK-Rollup | TVL: ~$500M+ | EVM: Yes | Use case: Bitcoin-native DeFi | Speed: ~2 seconds | Key feature: ZK-rollup, Bitmap protocol.'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for payments?',
			body: 'For pure payments — sending and receiving Bitcoin between individuals — Lightning Network remains the clear winner. It offers instant settlements, near-zero fees, and the most mature payment infrastructure with thousands of integrated wallets and merchants. If you need stablecoin payments with privacy, Liquid Network offers confidential Tether USDt transactions with ~2 minute confirmations. For escrow-based payments with smart contract guarantees, Rootstock provides Bitcoin-backed escrow contracts. The choice depends on your specific needs: speed (Lightning), privacy (Liquid), or programmability (Rootstock). Our payments guide explains every option.'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for DeFi?',
			body: 'For general DeFi (lending, borrowing, AMMs), Rootstock and Stacks are the strongest options. Rootstock offers full EVM compatibility, so existing Ethereum DeFi tools and contracts work with minimal changes. Stacks brings Clarity\'s safety guarantees and sBTC for programmable Bitcoin. Merlin Chain and BOB are newer but growing fast with ZK-rollup technology and Bitcoin-native features. The "best" depends on whether you prioritize EVM tooling (Rootstock), Bitcoin-native language safety (Stacks), or cutting-edge ZK technology (Merlin/BOB). Our DeFi guide covers strategies across all platforms.'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for privacy?',
			body: 'Liquid Network is the clear leader for transaction privacy. Its confidential transactions hide amounts and asset types from public view using Pedersen commitments. No other Bitcoin Layer 2 offers privacy by default. For payment-level privacy, Lightning Network inherently provides some privacy since channel details are not broadcast. However, for comprehensive transaction privacy (hiding amounts and asset types on-chain), Liquid is unmatched in the Bitcoin Layer 2 space. Our privacy guide covers confidential transactions, CoinJoin, and best practices.'
		},
		{
			heading: 'How does BitTasker use multiple Layer 2s?',
			body: 'BitTasker is built multi-chain by design, using the right Layer 2 for each feature. Lightning Network handles instant freelancer payouts — payments arrive in seconds with near-zero fees. Rootstock powers the escrow system — smart contracts merged-mined with Bitcoin provide trustless payment protection. Stablecoin support (USDC on Rootstock) gives clients dollar-denominated budget predictability. This multi-chain approach means freelancers get the benefits of each Layer 2 without needing to understand the technical differences. A client funds escrow in USDC on Rootstock; the freelancer receives payment via Lightning in BTC — the smart contract handles the conversion. Our multi-chain guide explains the full integration.'
		}
	],
	faq: [
		{
			question: 'What is the largest Bitcoin Layer 2 by TVL?',
			answer:
				'Stacks and Merlin Chain currently compete for the highest TVL among Bitcoin Layer 2s, with both exceeding $500M at various points. Rootstock holds approximately $235M, while Lightning Network channels hold around $200M.'
		},
		{
			question: 'Are Bitcoin Layer 2s safe?',
			answer:
				'Safety varies. Lightning has strong security for payment channels but requires online nodes. Rootstock inherits Bitcoin security through merged mining. Stacks settles on Bitcoin with Nakamoto upgrade. Liquid uses a federation model. Each has different trust assumptions.'
		},
		{
			question: 'Can I use multiple Bitcoin Layer 2s?',
			answer:
				'Yes. Many users operate across multiple Layer 2s. A freelancer might use Lightning for instant payments, Rootstock for escrow, and Liquid for stablecoins. Wallets like Aqua support multiple Layer 2s natively.'
		},
		{
			question: 'Which has the lowest fees?',
			answer:
				'Lightning Network has the lowest fees — often fractions of a cent. Rootstock and Stacks typically charge under $0.01 per smart contract interaction. Liquid transactions cost about $0.05-0.10.'
		},
		{
			question: 'What is the Nakamoto upgrade?',
			answer:
				"The Nakamoto upgrade is Stacks' major improvement bringing faster block times (from ~10 minutes to seconds), stronger Bitcoin finality, and sBTC infrastructure. It was fully activated in late 2024."
		},
		{
			question: 'Is Bitcoin Layer 2 the same as Ethereum Layer 2?',
			answer:
				"No. Bitcoin Layer 2s are built on Bitcoin's security model for Bitcoin-specific use cases. Ethereum Layer 2s (Arbitrum, Optimism) are built on Ethereum with different consensus, languages, and trust models."
		},
		{
			question: 'How do I choose the right Bitcoin Layer 2?',
			answer:
				'Start with your use case: payments → Lightning, DeFi → Rootstock/Stacks, privacy → Liquid, NFTs → Stacks/Merlin. Consider ecosystem maturity: Lightning and Rootstock are most battle-tested.'
		}
	],
	bitTaskerCta: {
		heading: 'BitTasker Uses the Best Layer 2s for Every Job',
		body: "Lightning for instant payments, Rootstock for smart contract escrow, Liquid for stablecoin privacy. BitTasker picks the right Layer 2 for each feature so you don't have to.",
		buttonText: 'Start Freelancing on Bitcoin',
		buttonHref: '/auth/signup'
	}
};
