import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock: Build Smart Contracts on Bitcoin',
		subtitle:
			'EVM-compatible smart contracts, RBTC, DeFi, and escrow — the complete Rootstock reference.'
	},
	answerBlock:
		"Rootstock (RSK) is a Bitcoin sidechain that brings Ethereum-compatible smart contracts to the Bitcoin network. As the oldest and most established Bitcoin EVM sidechain, Rootstock is secured by Bitcoin's hash rate through merged mining, uses RBTC for gas fees, and has over $235 million in total value locked. It powers DeFi protocols, tokenization, NFTs, DAOs, and the escrow system behind BitTasker. If you want to build on Bitcoin without leaving the EVM ecosystem, Rootstock is the bridge. This guide covers everything: what Rootstock is, how it compares to alternatives, how smart contracts work on Bitcoin, the DeFi landscape, and how to use RBTC.",
	sections: [
		{
			heading: 'What is Rootstock?',
			body: "Rootstock (RSK) is a Bitcoin sidechain that brings Ethereum-compatible smart contracts to the Bitcoin network. Launched in January 2018, it is the oldest Bitcoin smart contract platform in production. Rootstock is secured by Bitcoin's hash rate through merged mining — Bitcoin miners mine both Bitcoin and Rootstock blocks simultaneously, providing Bitcoin-level security to the sidechain. It uses RBTC, a token pegged 1:1 to Bitcoin, for gas fees. Developers deploy Solidity smart contracts that settle on Bitcoin's security layer. With over $235 million in TVL and growing institutional adoption across Japan, Brazil, and Latin America, Rootstock bridges Bitcoin's unmatched security with the programmability needed for DeFi, escrow, and asset tokenization. Our Rootstock guide provides the full technical breakdown."
		},
		{
			heading: 'What is RBTC?',
			body: 'RBTC (Rootstock Bitcoin) is the native token of the Rootstock network, pegged 1:1 to Bitcoin. It is used to pay for gas fees when executing smart contracts on Rootstock — similar to how ETH works on Ethereum. You obtain RBTC by bridging BTC from the Bitcoin mainchain to Rootstock through a federated bridge. When you want to move back to Bitcoin, RBTC is burned on Rootstock and BTC is unlocked on the mainchain. RBTC is not a separate cryptocurrency — it represents BTC operating on the Rootstock sidechain. The peg is maintained by a network of functionaries that lock BTC when issuing RBTC and unlock BTC when RBTC is burned. Our RBTC guide covers bridging, gas estimation, and wallet setup.'
		},
		{
			heading: 'How do smart contracts work on Rootstock?',
			body: 'Rootstock is fully EVM-compatible, meaning Ethereum developers can deploy existing Solidity contracts with zero code changes. The entire Ethereum developer toolchain — Remix, Hardhat, Foundry, MetaMask, OpenZeppelin — works on Rootstock out of the box. Smart contracts on Rootstock execute with Bitcoin-level security through merged mining. Gas fees are paid in RBTC and are significantly lower than Ethereum (typically under $0.01 per transaction). Rootstock also supports precompiled contracts for Bitcoin-native operations like signature verification and hash functions. For developers who want to build on Bitcoin without learning a new programming language, Rootstock is the easiest path. Our smart contracts guide covers deployment, testing, and best practices.'
		},
		{
			heading: 'What is Bitcoin DeFi?',
			body: "Bitcoin DeFi refers to decentralized finance applications built on Bitcoin or Bitcoin sidechains. Rootstock hosts a growing DeFi ecosystem: Sovryn (decentralized trading and lending), MoneyOnChain (Bitcoin-backed stablecoins like DOC and rDOC), Tropykus (savings and lending), and Beex (exchange). These protocols leverage Bitcoin's security while providing the programmability needed for complex financial instruments. With over $235 million in TVL on Rootstock alone, Bitcoin DeFi is growing rapidly. The key advantage over Ethereum DeFi: the underlying security is backed by Bitcoin's hash rate — the most decentralized and battle-tested Proof of Work network. Our Bitcoin DeFi guide covers every major protocol and strategy."
		},
		{
			heading: 'How does Rootstock compare to other Bitcoin Layer 2s?',
			body: "Rootstock stands out among Bitcoin Layer 2s for its full EVM compatibility, longest production track record (since 2018), and Bitcoin-secured consensus through merged mining. Compared to Stacks: Rootstock uses Solidity (Ethereum's language); Stacks uses Clarity. Rootstock has EVM tooling; Stacks has sBTC and Nakamoto upgrade. Compared to Liquid: Rootstock has smart contracts and DeFi; Liquid focuses on confidential transactions and asset issuance. Compared to Merlin and BOB: Rootstock is more battle-tested; newer chains offer ZK-rollup technology. For freelancing and escrow, Rootstock's maturity and EVM compatibility make it the most practical choice. Our Rootstock comparisons provide detailed head-to-head analysis."
		},
		{
			heading: 'How does BitTasker use Rootstock?',
			body: "BitTasker uses Rootstock smart contracts as the backbone of its escrow system. When a client funds a project, the payment is locked in a Rootstock smart contract — merged-mined with Bitcoin for security. The contract enforces agreed terms: funds release when milestones are approved, disputes follow transparent resolution rules. No single entity — including BitTasker — can move the escrowed funds unilaterally. Rootstock was chosen for its EVM compatibility (enabling standard Solidity contracts), Bitcoin-level security (merged mining), low gas fees (under $0.01), and proven track record (6+ years in production). The integration means freelancers and clients get the benefits of Bitcoin-secured smart contracts without needing to understand Rootstock's technical details."
		}
	],
	faq: [
		{
			question: 'Is Rootstock the same as Bitcoin?',
			answer:
				"No. Rootstock is a sidechain — a separate network connected to Bitcoin via a two-way peg. It runs parallel to Bitcoin, not on top of it. Rootstock brings smart contract functionality while being secured by Bitcoin's hash rate through merged mining."
		},
		{
			question: 'What is the difference between Rootstock and Ethereum?',
			answer:
				'Both are EVM-compatible, but Rootstock is secured by Bitcoin through merged mining while Ethereum uses Proof of Stake. Rootstock has lower fees and allows direct use of BTC in contracts. Ethereum has a larger developer ecosystem and more TVL.'
		},
		{
			question: 'Do I need to know Solidity to use Rootstock?',
			answer:
				'To deploy smart contracts, yes — Rootstock uses Solidity. To use dApps on Rootstock, you just need a compatible wallet like MetaMask configured for the Rootstock network.'
		},
		{
			question: 'How much does it cost to use Rootstock?',
			answer:
				'Gas fees are significantly lower than Ethereum — typically under $0.01 per transaction. You need RBTC to pay gas, which you obtain by bridging BTC to Rootstock.'
		},
		{
			question: 'Is Rootstock safe?',
			answer:
				"Rootstock is secured by Bitcoin's hash rate through merged mining. It has been in production since 2018 with no security incidents. The federated bridge has processed billions in cross-chain transfers."
		},
		{
			question: 'What is the TVL on Rootstock?',
			answer:
				"Rootstock's TVL has ranged between $235 million and $267 million, making it one of the largest Bitcoin sidechains. TVL fluctuates with market conditions but has shown consistent growth."
		},
		{
			question: 'How do I get RBTC?',
			answer:
				'Bridge BTC from the Bitcoin mainchain to Rootstock using the official bridge or supported wallets. One BTC converts to one RBTC. You need a small amount of RBTC for gas fees.'
		}
	],
	bitTaskerCta: {
		heading: 'Build on Bitcoin with BitTasker',
		body: "BitTasker uses Rootstock smart contracts for trustless escrow. Your payments are secured by Bitcoin's hash rate — no platform holds your funds.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
