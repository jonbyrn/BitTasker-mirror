import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin DeFi: Decentralized Finance on Rootstock',
		subtitle:
			"DeFi on Bitcoin is here. Rootstock powers lending, borrowing, DEX, and stablecoins secured by Bitcoin's hash rate."
	},
	answerBlock:
		"Bitcoin DeFi refers to decentralized financial applications built on Bitcoin through Layer 2 platforms like Rootstock. Instead of keeping Bitcoin as a passive store of value, Bitcoin DeFi lets you lend, borrow, trade, and earn yield — all secured by Bitcoin's hash rate through merged mining. Rootstock hosts the largest Bitcoin DeFi ecosystem with protocols like Sovryn (decentralized trading and lending), MoneyOnChain (Bitcoin-backed stablecoins), and Tropykus (savings accounts). With over $235M in TVL, Bitcoin DeFi on Rootstock offers a way to put your Bitcoin to work without leaving Bitcoin's security model.",
	sections: [
		{
			heading: 'What is Bitcoin DeFi?',
			body: "Bitcoin DeFi is the ecosystem of decentralized financial applications that run on Bitcoin sidechains or Layer 2 networks. Unlike Ethereum DeFi, which runs on Ethereum's own blockchain, Bitcoin DeFi operates on networks like Rootstock that are secured by Bitcoin through merged mining. This means your funds in Bitcoin DeFi protocols benefit from Bitcoin's security — the largest hash rate in the world. Bitcoin DeFi includes lending, borrowing, decentralized exchanges, stablecoins, yield farming, and asset tokenization, all using BTC or BTC-pegged tokens as the primary asset."
		},
		{
			heading: 'What DeFi protocols run on Rootstock?',
			body: "Rootstock hosts several established DeFi protocols. Sovryn is the largest, offering a decentralized exchange (AMM), margin trading, lending, and borrowing. MoneyOnChain provides Bitcoin-backed stablecoins (DOC and RIF Dollar) that maintain a 1:1 USD peg while being backed by BTC locked on Rootstock. Tropykus offers savings accounts with competitive yields by deploying funds across multiple DeFi protocols. These protocols have been in production for years, processing billions in volume and demonstrating the viability of DeFi built directly on Bitcoin's security layer."
		},
		{
			heading: 'How does lending work in Bitcoin DeFi?',
			body: "Bitcoin DeFi lending on Rootstock works similarly to Ethereum lending protocols. Users deposit BTC or RBTC into lending pools and earn interest from borrowers. Borrowers provide collateral (typically more BTC than they borrow) and receive loans in stablecoins or other assets. The smart contracts enforce liquidation rules — if collateral value drops below a threshold, it's automatically sold to repay the loan. On Sovryn, for example, you can lend BTC and earn yield, or borrow stablecoins against your BTC collateral without selling it. All of this is executed by auditable smart contracts on Rootstock, secured by Bitcoin's hash rate."
		},
		{
			heading: 'What are Bitcoin-backed stablecoins?',
			body: "Bitcoin-backed stablecoins are tokens pegged to the US dollar but collateralized by Bitcoin locked on Rootstock. MoneyOnChain's DOC (Dollar on Chain) is the primary example — it maintains a 1:1 USD peg through arbitrage mechanisms and is backed by BTC deposited in MoneyOnChain's protocol. RIF Dollar is another stablecoin in the Rootstock ecosystem. Unlike centralized stablecoins (USDT, USDC), Bitcoin-backed stablecoins are decentralized and transparent — you can verify the collateral on-chain. This makes them attractive for DeFi users who want dollar stability without relying on centralized issuers."
		},
		{
			heading: 'What are the risks of Bitcoin DeFi?',
			body: 'Bitcoin DeFi carries several risks. Smart contract bugs could lead to fund loss, though audited protocols mitigate this. Bridge risk exists when BTC is locked on Rootstock — if the federated bridge has issues, accessing funds could be temporarily affected. Liquidity risk means some DeFi pools may not have enough assets for large withdrawals. Yield risk — advertised rates can change based on market conditions. Regulatory risk — DeFi regulations are evolving globally. Counterparty risk is reduced compared to centralized platforms but not eliminated entirely. Always research protocols thoroughly, start with small amounts, and understand the risks before committing significant capital.'
		},
		{
			heading: 'Why is Bitcoin DeFi growing?',
			body: "Bitcoin DeFi is growing because Bitcoin holders want to earn yield on their BTC without selling or moving to Ethereum. Rootstock makes this possible by providing EVM-compatible smart contracts secured by Bitcoin. Institutional interest is increasing as regulated entities look for compliant ways to access DeFi returns. The growth of Bitcoin Layer 2 infrastructure has also improved UX, making it easier to bridge BTC and interact with DeFi protocols. BitTasker's use of Rootstock for escrow also demonstrates real-world DeFi utility beyond trading — securing freelance payments with smart contracts."
		}
	],
	faq: [
		{
			question: 'Can I earn yield on Bitcoin with DeFi?',
			answer:
				'Yes. On Rootstock, you can lend BTC through protocols like Sovryn and Tropykus to earn interest. You can also provide liquidity to DEX pools or participate in yield farming. Returns vary based on market conditions and protocol-specific factors.'
		},
		{
			question: 'Is Bitcoin DeFi safe?',
			answer:
				"Bitcoin DeFi on Rootstock is secured by Bitcoin's hash rate through merged mining, providing strong security. However, smart contract risks, bridge risks, and market risks still exist. Use audited protocols, start with small amounts, and never invest more than you can afford to lose."
		},
		{
			question: 'What is the difference between Bitcoin DeFi and Ethereum DeFi?',
			answer:
				"Bitcoin DeFi uses BTC as the primary asset and is secured by Bitcoin miners. Ethereum DeFi uses ETH and is secured by Ethereum's Proof of Stake. Bitcoin DeFi has lower TVL and fewer protocols but benefits from Bitcoin's security model and attracts Bitcoin-native users."
		},
		{
			question: 'Do I need to wrap my BTC to use Bitcoin DeFi?',
			answer:
				"On Rootstock, you bridge BTC to get RBTC (pegged 1:1 to BTC). This is different from wrapping — RBTC exists on a Bitcoin sidechain secured by merged mining, not on Ethereum. The bridge process is straightforward through Rootstock's federated bridge."
		},
		{
			question: 'What is the TVL of Bitcoin DeFi on Rootstock?',
			answer:
				"Rootstock's total TVL has ranged between $235M and $267M, with the majority in DeFi protocols like Sovryn and MoneyOnChain. This makes Rootstock one of the largest Bitcoin sidechains by value locked."
		},
		{
			question: 'Can I use Bitcoin DeFi for freelancing?',
			answer:
				'Yes. BitTasker uses Rootstock smart contracts for trustless escrow in freelance projects. This is a practical DeFi application where smart contracts guarantee payment without platform intermediaries.'
		}
	],
	bitTaskerCta: {
		heading: 'Put your Bitcoin to work with BitTasker',
		body: "BitTasker uses Rootstock DeFi infrastructure for secure, trustless escrow. Your freelance payments are protected by Bitcoin's security — no company holds your funds.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
