import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Smart Contracts: How They Work on Rootstock',
		subtitle:
			"Smart contracts on Bitcoin are real — and they run on Rootstock. Learn how Solidity contracts execute on the world's most secure blockchain."
	},
	answerBlock:
		"Bitcoin smart contracts are self-executing programs that run on Rootstock, a Bitcoin sidechain that brings Ethereum Virtual Machine (EVM) compatibility to Bitcoin. Instead of deploying contracts on Ethereum, developers write Solidity code that executes on Rootstock and is secured by Bitcoin's hash rate through merged mining. This means you get the full programmability of Ethereum smart contracts — escrow, lending, tokenization, DEX — with Bitcoin's unmatched security. BitTasker uses Rootstock smart contracts to power its trustless escrow system, where project funds are locked in auditable code until both parties confirm completion.",
	sections: [
		{
			heading: 'How do smart contracts work on Bitcoin?',
			body: "Bitcoin's base layer has intentionally limited scripting capabilities for security reasons. Smart contracts on Bitcoin work through Layer 2 solutions like Rootstock, which runs as a sidechain connected to Bitcoin. When you deploy a smart contract on Rootstock, it executes on the Rootstock network but settles its state to Bitcoin through merged mining. The contract logic runs in the EVM (Ethereum Virtual Machine), which is fully compatible with Ethereum's execution environment. This means Solidity contracts — the same code that runs on Ethereum — work on Rootstock with zero modifications. The key difference is that Rootstock's security is backed by Bitcoin miners, not a separate validator set."
		},
		{
			heading: 'What can you build with Bitcoin smart contracts?',
			body: "Bitcoin smart contracts on Rootstock enable the same applications as Ethereum, but secured by Bitcoin: escrow systems for freelancers and marketplaces (like BitTasker), decentralized lending and borrowing protocols (like Sovryn), stablecoins backed by BTC (like MoneyOnChain), decentralized exchanges, tokenized real-world assets, NFTs, and DAOs. The advantage of building these on Rootstock instead of Ethereum is that your contracts are protected by Bitcoin's hash rate — the largest and most decentralized security layer in cryptocurrency. This is especially valuable for applications that hold significant value, like escrow and DeFi protocols."
		},
		{
			heading: 'How do Bitcoin smart contracts compare to Ethereum contracts?',
			body: "Functionally, Bitcoin smart contracts on Rootstock and Ethereum contracts are nearly identical — both use Solidity and the EVM. The differences are in security and cost. Rootstock contracts are secured by Bitcoin's merged mining, providing arguably stronger security guarantees than Ethereum's Proof of Stake. Gas fees on Rootstock are significantly lower than Ethereum mainnet (typically under $0.01 vs. $1-50+ on Ethereum). However, Ethereum has a larger ecosystem with more deployed contracts, more developers, and higher total value locked. For applications that prioritize Bitcoin-level security and lower costs over ecosystem size, Rootstock is the stronger choice."
		},
		{
			heading: 'How does BitTasker use Bitcoin smart contracts?',
			body: 'BitTasker deploys escrow smart contracts on Rootstock that automatically manage freelance project payments. When a client posts a project, funds are deposited into a Rootstock smart contract that locks them according to predefined conditions — typically milestone delivery and approval. The contract enforces payment rules without any human intermediary. When both parties confirm completion, funds are released to the freelancer. If a dispute arises, the contract follows structured resolution rules. All contract logic is auditable on the blockchain, so both parties can verify the escrow conditions before committing. This eliminates the need to trust a platform company with your money.'
		},
		{
			heading: 'Are Bitcoin smart contracts secure?',
			body: "Smart contracts on Rootstock inherit Bitcoin's security through merged mining. This means the same hash power that secures billions of dollars of Bitcoin also secures Rootstock contracts. In practice, attacking a Rootstock contract would require compromising Bitcoin's hash rate — an astronomically expensive proposition. Additionally, Rootstock contracts use auditable, open-source Solidity code. Well-audited contracts from libraries like OpenZeppelin can be deployed directly, reducing the risk of vulnerabilities. The combination of Bitcoin-level security and auditable code makes Rootstock smart contracts among the most secure in the industry."
		},
		{
			heading: 'What are the limitations of Bitcoin smart contracts?',
			body: 'The main limitation is ecosystem size — Rootstock has fewer deployed contracts and smaller developer community than Ethereum. Bridge risk exists when moving BTC to Rootstock (the federated bridge introduces a trust assumption). Smart contract bugs can still occur if code is poorly written or unaudited, regardless of the underlying blockchain. Transaction throughput on Rootstock is higher than Bitcoin mainnet but lower than dedicated high-throughput chains. For most applications, especially those prioritizing security over raw speed, these limitations are acceptable trade-offs.'
		}
	],
	faq: [
		{
			question: 'Can you really run smart contracts on Bitcoin?',
			answer:
				"Yes, through Rootstock. Rootstock is a Bitcoin sidechain that brings full EVM smart contract capability to Bitcoin. Contracts are secured by Bitcoin through merged mining and settle to Bitcoin's blockchain. It's not theoretical — Rootstock has been running smart contracts in production since 2018."
		},
		{
			question: 'Do I need to learn a new language for Bitcoin smart contracts?',
			answer:
				"No. Rootstock uses Solidity, the same language used for Ethereum smart contracts. If you know Solidity, you can deploy on Rootstock immediately. If you're new to smart contracts, Solidity is the most widely documented and taught smart contract language."
		},
		{
			question: 'Are Bitcoin smart contracts on Rootstock the same as on Ethereum?',
			answer:
				"The contracts themselves are identical — both use Solidity and the EVM. The difference is the underlying security: Rootstock contracts are backed by Bitcoin miners, while Ethereum contracts are secured by Ethereum's Proof of Stake validators. Rootstock also has lower gas fees."
		},
		{
			question: 'How much does it cost to deploy a smart contract on Rootstock?',
			answer:
				'Deployment costs vary based on contract complexity, but Rootstock gas fees are significantly lower than Ethereum. Simple contract deployments typically cost under $0.10 on Rootstock, compared to $50-500+ on Ethereum mainnet.'
		},
		{
			question: "Is BitTasker's escrow contract audited?",
			answer:
				"BitTasker's escrow contracts are built using audited libraries and follow established smart contract security best practices. The contract code is auditable on the Rootstock blockchain, providing full transparency to all parties."
		}
	],
	bitTaskerCta: {
		heading: 'Experience Bitcoin smart contracts in action',
		body: "BitTasker's escrow contracts on Rootstock prove that Bitcoin smart contracts work — auditable, secure, and trustless. Try it with your next freelance project.",
		buttonText: 'Start a Project',
		buttonHref: '/auth/signup'
	}
};
