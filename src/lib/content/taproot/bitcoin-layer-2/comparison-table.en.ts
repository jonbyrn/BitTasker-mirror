import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Best Bitcoin Layer 2: Comparison Table & Guide',
		subtitle:
			'Compare Lightning, Rootstock, Stacks, Liquid, Merlin, and BOB. Find the right Bitcoin Layer 2 for your use case.'
	},
	answerBlock:
		'There is no single "best" Bitcoin Layer 2 — each network optimizes for different use cases. Lightning is the fastest for payments. Rootstock leads in TVL and DeFi with EVM compatibility. Stacks brings the Nakamoto upgrade and sBTC for programmable Bitcoin. Liquid excels at confidential transactions and asset issuance. Merlin and BOB (Build on Bitcoin) are newer entrants focusing on Bitcoin-native DeFi and multi-VM support. Your choice depends on what you\'re building: payments, DeFi, privacy, NFTs, or enterprise asset issuance.',
	sections: [
		{
			heading: 'What are Bitcoin Layer 2s?',
			body: "Bitcoin Layer 2s are networks built on top of Bitcoin that add capabilities the base chain doesn't support natively — like smart contracts, faster transactions, privacy features, and token issuance. They settle transactions back to Bitcoin for security while processing activity on their own chains. The main categories are payment channels (Lightning), sidechains (Rootstock, Liquid), and Layer 2s with Bitcoin settlement (Stacks, Merlin, BOB). Each approaches the Bitcoin scalability trilemma differently, trading off between decentralization, speed, and functionality."
		},
		{
			heading: 'How do Bitcoin Layer 2s compare to each other?',
			body: 'Lightning Network | Consensus: Payment channels | TVL: ~$200M | EVM: No | Use case: Instant payments | Speed: Instant | Key feature: Micropayments, lowest fees.\n\nRootstock | Consensus: Merged mining with Bitcoin | TVL: ~$235M | EVM: Yes (full) | Use case: DeFi, escrow, dApps | Speed: ~30 seconds | Key feature: Bitcoin-secured smart contracts, RBTC gas.\n\nStacks | Consensus: Proof of Transfer (PoX) | TVL: ~$500M+ | EVM: No (Clarity) | Use case: DeFi, NFTs, DAOs | Speed: Seconds (post-Nakamoto) | Key feature: sBTC, Clarity language, Bitcoin settlement.\n\nLiquid Network | Consensus: Federation | TVL: ~$180M | EVM: No | Use case: Privacy, asset issuance | Speed: ~2 minutes | Key feature: Confidential transactions, Tether USDt.\n\nMerlin Chain | Consensus: Bitmap + ZK-Rollup | TVL: ~$500M+ | EVM: Yes | Use case: Bitcoin-native DeFi | Speed: ~2 seconds | Key feature: ZK-rollup, Bitmap protocol.\n\nBOB (Build on Bitcoin) | Consensus: Hybrid (Bitcoin + OP_NET) | TVL: ~$200M+ | EVM: Yes + Bitcoin VM | Use case: Bitcoin-native DeFi | Speed: ~2 seconds | Key feature: Multi-VM, OP_NET ordinals support.'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for payments?',
			body: 'For pure payments — sending and receiving Bitcoin between individuals — Lightning Network remains the clear winner. It offers instant settlements, near-zero fees, and the most mature payment infrastructure with thousands of integrated wallets and merchants. If you need stablecoin payments with privacy, Liquid Network offers confidential Tether USDt transactions with ~2 minute confirmations. For escrow-based payments with smart contract guarantees, Rootstock provides Bitcoin-backed escrow contracts.'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for DeFi?',
			body: 'For general DeFi (lending, borrowing, AMMs), Rootstock and Stacks are the strongest options. Rootstock offers full EVM compatibility, so existing Ethereum DeFi tools and contracts work with minimal changes. Stacks brings Clarity\'s safety guarantees and sBTC for programmable Bitcoin. Merlin Chain and BOB are newer but growing fast with ZK-rollup technology and Bitcoin-native features like ordinals support. The "best" depends on whether you prioritize EVM tooling (Rootstock), Bitcoin-native language safety (Stacks), or cutting-edge ZK technology (Merlin/BOB).'
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for privacy?',
			body: "Liquid Network is the clear leader for transaction privacy. Its confidential transactions hide amounts and asset types from public view using Pedersen commitments. No other Bitcoin Layer 2 offers privacy by default. For payment-level privacy, Lightning Network inherently provides some privacy since channel details aren't broadcast. However, for comprehensive transaction privacy (hiding amounts and asset types on-chain), Liquid is unmatched in the Bitcoin Layer 2 space."
		},
		{
			heading: 'Which Bitcoin Layer 2 is best for NFTs and asset issuance?',
			body: "Liquid Network offers the simplest asset issuance through its built-in protocol — no smart contracts needed, just the issuance mechanism. Stacks has a growing NFT ecosystem with marketplaces like Gamma. Merlin Chain supports Bitcoin-native ordinals and inscriptions. BOB bridges Bitcoin ordinals with EVM capabilities. For enterprise security tokens and regulated asset issuance, Liquid's confidential transactions and established federation make it the most mature option."
		},
		{
			heading: 'How do you choose the right Bitcoin Layer 2?',
			body: 'Start with your primary use case. Payments → Lightning or Liquid (for stablecoins). DeFi → Rootstock (EVM), Stacks (Clarity), or Merlin/BOB (ZK). Privacy → Liquid. NFTs → Stacks or Merlin. Asset issuance → Liquid. Also consider ecosystem maturity: Lightning and Rootstock are the most battle-tested. Stacks has the strongest Bitcoin-native narrative with Nakamoto and sBTC. Liquid has unique privacy features. Merlin and BOB offer cutting-edge technology but are less proven. On BitTasker, the hirer locks Bitcoin, USDT on RGB, or a Lightning payment in the wallet they open with a passkey. After the work is approved, the hirer pays their invoice. Messages open only after escrow is formed, and reviews open only after that payment.'
		}
	],
	faq: [
		{
			question: 'What is the largest Bitcoin Layer 2 by TVL?',
			answer:
				'Stacks and Merlin Chain currently compete for the highest TVL among Bitcoin Layer 2s, with both exceeding $500M at various points. Rootstock holds approximately $235M, while Lightning Network channels hold around $200M. TVL fluctuates based on market conditions and DeFi activity.'
		},
		{
			question: 'Are Bitcoin Layer 2s safe?',
			answer:
				'Safety varies by Layer 2. Lightning has strong security for payment channels but requires online nodes. Rootstock inherits Bitcoin security through merged mining. Stacks settles on Bitcoin with the Nakamoto upgrade. Liquid uses a federation model — faster but requires trusting functionaries. Each has different trust assumptions.'
		},
		{
			question: 'Can I use multiple Bitcoin Layer 2s?',
			answer:
				'Yes. Many users and platforms operate across multiple Layer 2s. A freelancer might use Lightning for instant payments, Rootstock for escrow, and Liquid for stablecoins. Wallets like Aqua support multiple Layer 2s natively.'
		},
		{
			question: 'Which Bitcoin Layer 2 has the lowest fees?',
			answer:
				'Lightning Network has the lowest fees — often fractions of a cent per transaction. Rootstock and Stacks typically charge under $0.01 per smart contract interaction. Liquid transactions cost about $0.05-0.10. Fees vary based on network congestion and transaction complexity.'
		},
		{
			question: 'What is the Nakamoto upgrade?',
			answer:
				"The Nakamoto upgrade is Stacks' major improvement that brings faster block times (from ~10 minutes to seconds), stronger Bitcoin finality, and sBTC infrastructure. It was fully activated in late 2024 and significantly improved Stacks' performance and capabilities."
		},
		{
			question: 'Is Bitcoin Layer 2 the same as Ethereum Layer 2?',
			answer:
				"No. Bitcoin Layer 2s are built on Bitcoin's security model and designed for Bitcoin-specific use cases. Ethereum Layer 2s (like Arbitrum, Optimism) are built on Ethereum. They have different consensus mechanisms, programming languages, and trust models. Bitcoin Layer 2s generally prioritize Bitcoin compatibility over EVM compatibility."
		}
	],
	bitTaskerCta: {
		heading: 'BitTasker uses the best Bitcoin Layer 2s for every job',
		body: "On BitTasker, the hirer locks Bitcoin, USDT on RGB, or Lightning in the passkey wallet, then pays the invoice after approving the work. Messages open after escrow is formed. Reviews open after that payment.",
		buttonText: 'Start Freelancing on Bitcoin',
		buttonHref: '/auth/signup'
	}
};
