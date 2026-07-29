import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'What Is Rootstock? Bitcoin Smart Contracts Explained',
		subtitle:
			'Rootstock brings smart contracts to Bitcoin. Learn how the oldest Bitcoin EVM sidechain powers DeFi, escrow, and tokenization.'
	},
	answerBlock:
		"Rootstock (RSK) is a Bitcoin sidechain that brings Ethereum-compatible smart contracts to the Bitcoin network. Launched in 2018, it is the oldest and most established Bitcoin EVM sidechain, secured by Bitcoin's hash rate through merged mining. Rootstock uses RBTC — a token pegged 1:1 to Bitcoin — for gas fees, allowing developers to deploy Solidity smart contracts that settle on Bitcoin's security layer. With over $235 million in total value locked (TVL) and growing institutional adoption across Japan, Brazil, and Latin America, Rootstock bridges the gap between Bitcoin's unmatched security and the programmability needed for DeFi, escrow, and asset tokenization.",
	sections: [
		{
			heading: 'How does Rootstock connect to Bitcoin?',
			body: "Rootstock connects to Bitcoin through a two-way peg mechanism. Users lock BTC in a federated bridge on the Bitcoin mainchain and receive an equivalent amount of RBTC on the Rootstock sidechain. RBTC is pegged 1:1 to Bitcoin, meaning one RBTC always equals one BTC. When you want to move funds back to Bitcoin, the process reverses — RBTC is burned on Rootstock and BTC is unlocked on the mainchain. This two-way peg allows Bitcoin holders to access smart contract functionality without leaving Bitcoin's security model."
		},
		{
			heading: 'What makes Rootstock different from other Bitcoin Layer 2s?',
			body: "Rootstock stands out because it is fully EVM-compatible, meaning Ethereum developers can deploy existing Solidity contracts with zero code changes. Unlike other Bitcoin Layer 2 solutions, Rootstock inherits Bitcoin's security through merged mining — Bitcoin miners simultaneously mine both Bitcoin and Rootstock blocks, providing Bitcoin-level security to the sidechain. It is also the most mature Bitcoin smart contract platform, having been in production since January 2018 with over six years of uninterrupted uptime."
		},
		{
			heading: 'What is RBTC?',
			body: 'RBTC (Rootstock Bitcoin) is the native token of the Rootstock network, pegged 1:1 to Bitcoin. It is used to pay for gas fees when executing smart contracts on Rootstock, similar to how ETH works on Ethereum. You obtain RBTC by bridging BTC from the Bitcoin mainchain to Rootstock. The peg is maintained by a federated bridge network that locks BTC when issuing RBTC and unlocks BTC when RBTC is burned. RBTC is not a separate cryptocurrency — it represents BTC operating on the Rootstock sidechain.'
		},
		{
			heading: 'What can you build on Rootstock?',
			body: 'Rootstock supports the full range of smart contract applications: decentralized finance (DeFi) protocols like lending, borrowing, and decentralized exchanges; tokenization of real-world assets; NFTs; DAOs; and decentralized escrow systems. Because Rootstock is EVM-compatible, the entire Ethereum developer toolchain — Remix, Hardhat, MetaMask, and OpenZeppelin libraries — works on Rootstock out of the box. This makes it the easiest path for developers who want to build on Bitcoin without learning a new programming language.'
		},
		{
			heading: 'How is Rootstock secured?',
			body: "Rootstock is secured by Bitcoin through merged mining. Bitcoin miners mine Rootstock blocks alongside Bitcoin blocks using the same hash power, meaning an attacker would need to compromise Bitcoin's hash rate to attack Rootstock. This makes Rootstock one of the most secure smart contract platforms in existence — its security is backed by the largest and most decentralized Proof of Work network. The network has operated without interruption since 2018, and the federated bridge has processed billions of dollars in cross-chain transfers."
		},
		{
			heading: 'Who uses Rootstock?',
			body: 'Rootstock hosts a growing ecosystem of DeFi protocols including Sovryn (decentralized trading and lending), MoneyOnChain (Bitcoin-backed stablecoins), and Tropykus (savings and lending). Institutional adoption is expanding, particularly in Japan where exchanges like bitFlyer have integrated Rootstock, and in Brazil and Argentina where Bitcoin DeFi is gaining traction. BitTasker uses Rootstock for its smart contract escrow system, providing trustless payment protection for freelancers and clients.'
		}
	],
	faq: [
		{
			question: 'Is Rootstock the same as Bitcoin?',
			answer:
				"No. Rootstock is a sidechain — a separate network that connects to Bitcoin via a two-way peg. It runs parallel to Bitcoin, not on top of it. Rootstock brings smart contract functionality to Bitcoin while being secured by Bitcoin's hash rate through merged mining."
		},
		{
			question: 'What is the difference between Rootstock and Ethereum?',
			answer:
				'Both are EVM-compatible smart contract platforms, but Rootstock is secured by Bitcoin through merged mining while Ethereum uses its own Proof of Stake consensus. Rootstock has lower transaction fees and allows direct use of BTC in contracts without wrapping. Ethereum has a larger developer ecosystem and more total value locked.'
		},
		{
			question: 'Do I need to know Solidity to use Rootstock?',
			answer:
				'If you want to deploy smart contracts, yes — Rootstock uses Solidity, the same language as Ethereum. If you want to use dApps on Rootstock, you just need a compatible wallet like MetaMask configured for the Rootstock network.'
		},
		{
			question: 'How much does it cost to use Rootstock?',
			answer:
				'Rootstock gas fees are significantly lower than Ethereum, typically under $0.01 per transaction. You need RBTC to pay gas fees, which you obtain by bridging BTC to Rootstock.'
		},
		{
			question: 'Is Rootstock safe?',
			answer:
				"Rootstock is secured by Bitcoin's hash rate through merged mining, making it one of the most secure smart contract platforms. It has been in production since 2018 with no security incidents. The federated bridge has processed billions in cross-chain transfers without issues."
		},
		{
			question: 'What is the total value locked (TVL) on Rootstock?',
			answer:
				"Rootstock's TVL has ranged between $235 million and $267 million, making it one of the largest Bitcoin sidechains by total value locked. TVL fluctuates with market conditions but has shown consistent growth in institutional and retail adoption."
		}
	],
	bitTaskerCta: {
		heading: 'Build on Bitcoin with BitTasker',
		body: "BitTasker uses Rootstock smart contracts to provide trustless escrow for freelancers. Your payments are secured by Bitcoin's hash rate — no platform holds your funds.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
