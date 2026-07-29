import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock vs Stacks: Bitcoin Smart Contracts',
		subtitle:
			'Rootstock and Stacks both bring smart contracts to Bitcoin. Compare consensus, language, TVL, and ecosystem to pick the right one.'
	},
	answerBlock:
		'Rootstock and Stacks are the two leading platforms bringing smart contract capabilities to Bitcoin, but they take fundamentally different approaches. Rootstock is an EVM-compatible sidechain secured by Bitcoin merged mining, running in production since 2018 with Solidity support and over $235M in TVL. Stacks uses a custom language (Clarity) and Proof of Transfer consensus, launching its mainnet in 2021 with growing DeFi activity. Rootstock is better for developers who want Ethereum compatibility on Bitcoin, while Stacks offers a purpose-built approach with its own programming paradigm. The right choice depends on your technical requirements, desired ecosystem, and whether you prioritize EVM compatibility or native Bitcoin integration.',
	sections: [
		{
			heading: 'What is the difference between Rootstock and Stacks?',
			body: "The core difference is architecture. Rootstock is an EVM-compatible sidechain — it runs parallel to Bitcoin and is secured by Bitcoin miners through merged mining. Developers write smart contracts in Solidity, the same language used on Ethereum. Stacks is a Layer 1 that settles to Bitcoin through Proof of Transfer (PoX) consensus. It uses Clarity, a purpose-built language designed for predictable smart contracts. Rootstock offers EVM compatibility and lower fees; Stacks offers tighter Bitcoin integration through its unique consensus mechanism and the Clarity language's safety guarantees."
		},
		{
			heading: 'How does consensus differ between Rootstock and Stacks?',
			body: "Rootstock uses merged mining — Bitcoin miners mine Rootstock blocks simultaneously with Bitcoin blocks, sharing the same hash power. This gives Rootstock Bitcoin-level security from day one. Stacks uses Proof of Transfer (PoX), where STX miners commit BTC to participate in mining, and those BTC are sent to STX holders as rewards. PoX is a novel consensus mechanism that recycles Bitcoin to secure the Stacks network, but it has less hash power backing it compared to Rootstock's direct merged mining with Bitcoin miners."
		},
		{
			heading: 'Which has more value locked — Rootstock or Stacks?',
			body: "Rootstock has historically maintained higher TVL, ranging between $235M and $267M. Stacks TVL has been lower and more volatile, generally ranging between $50M and $150M depending on market conditions and STX token price. Rootstock's higher TVL reflects its longer track record (six+ years in production) and established DeFi ecosystem with protocols like Sovryn and MoneyOnChain. Stacks TVL has been growing with the rise of Bitcoin NFTs (Ordinals) and increasing developer activity."
		},
		{
			heading: 'Which programming languages do Rootstock and Stacks use?',
			body: 'Rootstock uses Solidity, giving developers access to the entire Ethereum toolchain — Hardhat, Remix, OpenZeppelin, and thousands of existing libraries. This drastically reduces the learning curve for Ethereum developers moving to Bitcoin. Stacks uses Clarity, a decidability-focused language where contracts can be statically analyzed before deployment. Clarity eliminates entire classes of bugs (reentrancy, overflow) by design, but has a smaller developer community and fewer existing libraries. Choose Rootstock for ecosystem breadth; choose Stacks for language safety guarantees.'
		},
		{
			heading: 'Which ecosystem is larger — Rootstock or Stacks?',
			body: 'Rootstock has a more mature DeFi ecosystem with established protocols: Sovryn (DEX and lending), MoneyOnChain (Bitcoin stablecoins), Tropykus (savings), and Dokyo (NFT marketplace). It also benefits from the broader Ethereum ecosystem through EVM compatibility — any Ethereum dApp can be deployed on Rootstock with minimal changes. Stacks has a growing ecosystem focused on Bitcoin-native applications, including ALEX (DeFi), Arkadiko (lending), and strong activity around Bitcoin Ordinals and BRC-20 tokens. Rootstock leads in DeFi maturity; Stacks leads in Bitcoin-native innovation.'
		},
		{
			heading: 'Which is better for freelancers and escrow?',
			body: 'For escrow and freelancing use cases, Rootstock has a clear advantage. Its EVM compatibility means audited, battle-tested smart contract libraries like OpenZeppelin can be used directly. The lower gas fees make microtransactions viable for small freelance projects. BitTasker chose Rootstock specifically because its six-year production track record, Bitcoin-level security, and Solidity support make it ideal for trustless escrow contracts that need to be reliable and cost-effective.'
		}
	],
	faq: [
		{
			question: 'Is Rootstock or Stacks more secure?',
			answer:
				"Rootstock is secured by Bitcoin's hash rate through merged mining, providing direct Bitcoin-level security. Stacks uses Proof of Transfer which recycles BTC for security but has less hash power. Rootstock has a longer security track record (since 2018) and benefits from the full weight of Bitcoin mining."
		},
		{
			question: 'Can I use Solidity on Stacks?',
			answer:
				'No. Stacks uses Clarity, a purpose-built smart contract language. You cannot deploy Solidity contracts on Stacks. If you want to use Solidity, Rootstock is the Bitcoin-compatible option.'
		},
		{
			question: 'Which is cheaper to use — Rootstock or Stacks?',
			answer:
				'Rootstock gas fees are typically under $0.01 per transaction. Stacks transaction costs depend on STX token price and network congestion, but are generally comparable. Both are significantly cheaper than Ethereum mainnet.'
		},
		{
			question: 'Can I bridge assets between Rootstock and Stacks?',
			answer:
				'There is no direct bridge between Rootstock and Stacks. To move assets between them, you would bridge through Bitcoin mainchain — converting RBTC to BTC, then bridging BTC to Stacks.'
		},
		{
			question: 'Which platform has more developers?',
			answer:
				'Rootstock benefits from the massive Ethereum developer community through EVM compatibility — any Solidity developer can build on Rootstock immediately. Stacks has a dedicated but smaller developer community focused on Clarity and Bitcoin-native applications.'
		},
		{
			question: 'Is Rootstock or Stacks better for NFTs?',
			answer:
				'Stacks has stronger NFT activity due to its close integration with Bitcoin Ordinals and BRC-20 tokens. Rootstock has the Dokyo NFT marketplace but less Ordinals-related activity. For Bitcoin-native NFTs, Stacks has the edge.'
		}
	],
	bitTaskerCta: {
		heading: 'Build escrow on Bitcoin with BitTasker',
		body: "BitTasker uses Rootstock's EVM-compatible smart contracts for trustless escrow. Six years of production security, auditable Solidity code, and Bitcoin-level protection for every project.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
