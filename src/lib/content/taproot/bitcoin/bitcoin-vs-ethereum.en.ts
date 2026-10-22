import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin vs Ethereum: Key Differences in 2026',
		subtitle:
			'An honest, balanced comparison of the two largest blockchains — and why they serve different purposes.'
	},
	answerBlock:
		'Bitcoin and Ethereum are the two largest cryptocurrencies, but they serve fundamentally different purposes. Bitcoin was designed as a decentralized store of value and peer-to-peer payment network — digital gold with unmatched security and simplicity. Ethereum was designed as a programmable platform for smart contracts, DeFi, and decentralized applications — a world computer for trustless logic. They are not direct competitors; they solve different problems. Bitcoin optimizes for security, decentralization, and monetary policy. Ethereum optimizes for flexibility, composability, and programmability. On BitTasker, the hirer locks Bitcoin or a Lightning payment in the wallet they open with a passkey. USDT coming soon. After the work is approved, the hirer pays their invoice. Messages open only after escrow is formed, and reviews open only after that payment.',
	sections: [
		{
			heading: "Bitcoin vs Ethereum: what's the fundamental difference?",
			body: 'Bitcoin was created in 2009 as a peer-to-peer electronic cash system and evolved into a store of value — "digital gold." Its design philosophy prioritizes simplicity, security, and immutability. The scripting language (Bitcoin Script) is intentionally limited to prevent attack surface. Ethereum, launched in 2015, was designed as a platform for smart contracts — self-executing programs that run on a decentralized world computer. Its Turing-complete language (Solidity) enables complex applications: DeFi protocols, NFT marketplaces, DAOs, and more. The key distinction: Bitcoin is money; Ethereum is a platform for building on top of money. Bitcoin\'s value proposition is sound, scarce money that no one can inflate or censor. Ethereum\'s value proposition is programmable money and trustless computation.'
		},
		{
			heading: 'What makes Bitcoin a strong store of value?',
			body: "Bitcoin's core strengths are its fixed monetary policy (21 million coins, halving every 4 years), unmatched security (largest hash rate of any network), and simplicity (fewer features = fewer attack vectors). Bitcoin processes roughly 7 transactions per second on-chain, with Lightning enabling thousands more off-chain. Its smart contract capabilities are intentionally limited — Bitcoin Script can handle multi-sig, time locks, and basic conditions, but not the complex logic of DeFi protocols. This isn't a bug; it's a feature. By keeping the base layer simple, Bitcoin achieves a level of decentralization and security that no other network matches. For storing value, sending large payments, or anchoring a financial system, Bitcoin's conservative design is its greatest asset."
		},
		{
			heading: 'What can you build with Ethereum smart contracts?',
			body: "Ethereum's strength is its programmability. With over 1,000 active developers and thousands of deployed contracts, Ethereum hosts the majority of decentralized finance (DeFi) activity, NFT marketplaces, and DAO governance. The EVM (Ethereum Virtual Machine) is the standard execution environment for smart contracts, with Solidity as the dominant language. Ethereum processes roughly 15-30 transactions per second on the base layer, with Layer 2 solutions (Arbitrum, Optimism, Base) scaling to thousands. Gas fees on the base layer can spike during high demand, making Layer 2s essential for everyday use. Ethereum's trade-off is complexity: a larger attack surface, more frequent upgrades, and a more complex monetary policy (post-merge, ETH issuance is near-zero but not capped)."
		},
		{
			heading: 'How do Bitcoin and Ethereum compare side by side?',
			body: 'Feature | Bitcoin | Ethereum\nLaunched | 2009 | 2015\nPurpose | Store of value, payments | Smart contracts, DApps\nConsensus | Proof of Work | Proof of Stake\nMonetary Policy | Fixed supply (21M) | No hard cap, near-zero issuance\nTransaction Speed | ~7 TPS (on-chain) | ~15-30 TPS (on-chain)\nSmart Contracts | Limited (Bitcoin Script) | Full (Solidity/EVM)\nLanguage | Bitcoin Script | Solidity, Vyper\nLayer 2 | Lightning Network | Arbitrum, Optimism, Base\nMain Use Case | Digital gold, payments | DeFi, NFTs, DAOs\nSecurity Model | Largest hash rate | Validator stake\nFees | Variable, higher during congestion | Gas-based, spikes during demand'
		},
		{
			heading: 'Are Bitcoin and Ethereum competitors?',
			body: 'Bitcoin and Ethereum are often framed as competitors, but this misses the point. They serve different roles in the decentralized ecosystem. Bitcoin is the apex store of value — secure, scarce, and simple. Ethereum is the apex smart contract platform — flexible, composable, and programmable. They can complement each other: Bitcoin holds value; Ethereum builds on top of it. Projects like Rootstock bridge these worlds by bringing EVM smart contracts to Bitcoin\'s security model. For freelancers, the question isn\'t "which is better?" but "which do I need for this task?" Store value in Bitcoin. Execute complex agreements on Ethereum or Rootstack. Send instant payments via Lightning. Each chain does what it does best.'
		},
		{
			heading: 'How does BitTasker use both Bitcoin and Ethereum?',
			body: "BitTasker uses Bitcoin and Ethereum-compatible chains for different functions. Bitcoin provides the store of value and payment rails — freelancers receive earnings in BTC, and Lightning Network handles instant, low-fee payouts. Rootstock (an EVM-compatible Bitcoin sidechain) provides the smart contract layer for escrow. This means escrow contracts benefit from Bitcoin's security model through merged mining while using the same Solidity language and EVM execution that Ethereum developers know. The result is a platform that combines the best of both worlds: Bitcoin's monetary security for holding value, and Ethereum-compatible smart contracts for programmable escrow and dispute resolution. Freelancers don't need to understand the technical differences — BitTasker handles the multi-chain complexity behind a simple interface."
		},
		{
			heading: 'Which should I choose: Bitcoin or Ethereum?',
			body: "For freelancers choosing between Bitcoin and Ethereum, the answer depends on your needs. If you want a store of value with the strongest security track record, Bitcoin is the clear choice. If you need to interact with DeFi protocols, mint NFTs, or use decentralized applications, Ethereum offers the most mature ecosystem. For receiving freelance payments, Bitcoin via Lightning provides the fastest, cheapest option. For using smart contract features like escrow, Rootstock (on Bitcoin's security model) gives you Ethereum-compatible functionality without leaving the Bitcoin ecosystem. Many crypto-native freelancers hold both — BTC for savings and payments, ETH for DeFi and smart contract interactions. The key insight is that these aren't competing technologies; they're complementary tools in the decentralized finance toolkit."
		}
	],
	faq: [
		{
			question: 'Which is better, Bitcoin or Ethereum?',
			answer:
				'Neither is universally "better" — they serve different purposes. Bitcoin is the strongest store of value and most secure blockchain. Ethereum is the most flexible platform for smart contracts and decentralized applications. For holding value, Bitcoin wins. For building applications, Ethereum wins. BitTasker uses both: Bitcoin for payments, Ethereum-compatible chains for smart contracts.'
		},
		{
			question: 'Can Bitcoin do everything Ethereum does?',
			answer:
				"No, and it doesn't try to. Bitcoin's base layer intentionally limits smart contract complexity for security reasons. Layer 2 solutions like Rootstock bring EVM compatibility to Bitcoin, but the base chain is optimized for value transfer, not programmability. Ethereum's base layer supports complex smart contracts natively."
		},
		{
			question: 'Is Ethereum more centralized than Bitcoin?',
			answer:
				"This is debated. Bitcoin's Proof of Work has more diverse mining distribution, but concentration in mining pools exists. Ethereum's Proof of Stake has lower hardware requirements for validators but shows concentration in staking pools and liquid staking protocols. Both face centralization pressures in different forms."
		},
		{
			question: "What about Ethereum's gas fees?",
			answer:
				"Ethereum base layer gas fees can spike to $10-50+ during high demand. Layer 2 solutions (Arbitrum, Optimism, Base) reduce this to under $0.10. For freelancers, this makes Layer 2 Ethereum practical for small transactions. Bitcoin's Lightning Network achieves similar low fees for payments without needing a separate Layer 2 ecosystem."
		},
		{
			question: 'Will Ethereum flip Bitcoin in market cap?',
			answer:
				"The \"flippening\" has been predicted since 2017 but hasn't occurred. Bitcoin's market dominance has remained above 40% throughout. Market cap depends on adoption, narrative, and utility — Bitcoin's digital gold narrative is deeply established, while Ethereum's platform narrative continues to evolve. Both have strong long-term value propositions."
		},
		{
			question: 'Can I use both Bitcoin and Ethereum on BitTasker?',
			answer:
				'Yes. On BitTasker, the hirer locks Bitcoin or a Lightning payment in the wallet they open with a passkey. USDT coming soon. After the work is approved, the hirer pays their invoice. Messages open only after escrow is formed, and reviews open only after that payment. This gives you the security of Bitcoin for payments with the flexibility of Ethereum-compatible smart contracts for project escrow — all within a single platform.'
		}
	],
	bitTaskerCta: {
		heading: 'Use the best of both chains on BitTasker',
		body: 'On BitTasker, the hirer locks Bitcoin or Lightning in the passkey wallet, then pays the invoice after approving the work. USDT coming soon. Messages open after escrow is formed. Reviews open after that payment.',
		buttonText: 'Get Started with BitTasker',
		buttonHref: '/auth/signup'
	}
};
