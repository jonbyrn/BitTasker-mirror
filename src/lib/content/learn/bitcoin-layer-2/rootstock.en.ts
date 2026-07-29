import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock: Bitcoin Layer 2 for Smart Contracts',
		subtitle:
			'EVM-compatible sidechain merge-mined with Bitcoin. Discover how Rootstock brings smart contracts to Bitcoin with $235M+ TVL.'
	},
	answerBlock:
		"Rootstock (RSK) is a Bitcoin Layer 2 sidechain that brings Ethereum-compatible smart contracts to the Bitcoin network. Launched in 2018 and secured through merged mining with Bitcoin miners, Rootstock lets developers deploy Solidity contracts that settle back to Bitcoin. It uses RBTC as its gas token and currently holds over $235M in total value locked (TVL) across DeFi, NFTs, and dApps. Unlike Layer 2s built on Ethereum, Rootstock inherits Bitcoin's security model directly — miners who already secure Bitcoin also validate Rootstock blocks, making it one of the most securely anchored smart contract platforms in the industry.",
	sections: [
		{
			heading: 'What is Rootstock?',
			body: "Rootstock is a sidechain of Bitcoin — a separate blockchain that runs parallel to Bitcoin's main chain and is connected via a two-way peg. It was the first programmable sidechain on Bitcoin, launched in January 2018. Rootstock is fully EVM-compatible, meaning any smart contract written in Solidity for Ethereum can be deployed on Rootstock with minimal changes. The sidechain uses its own virtual machine called the RVM (Rootstock Virtual Machine), which extends Ethereum's EVM with additional opcodes tailored for Bitcoin integration. Rootstock transactions are faster and cheaper than Bitcoin mainnet, but the security ultimately derives from Bitcoin through merged mining."
		},
		{
			heading: 'How does merged mining secure Rootstock?',
			body: "Merged mining allows Bitcoin miners to mine both Bitcoin and Rootstock simultaneously without expending additional computational power. Miners attach Rootstock blocks to their Bitcoin block solutions, and Rootstock nodes accept these as valid proof of work. This means Rootstock benefits from the same hash rate that secures Bitcoin — currently the highest of any blockchain. The tradeoff is that Rootstock block production depends on Bitcoin miners choosing to participate in merged mining. In practice, a significant portion of Bitcoin's hash rate has opted into Rootstock mining, providing robust security since the sidechain's inception."
		},
		{
			heading: 'What is RBTC and how is it used?',
			body: "RBTC (Rootstock Bitcoin) is the native gas token of the Rootstock network. It is pegged 1:1 to BTC, meaning 1 RBTC is backed by 1 BTC held in a federation-controlled bridge. Users convert BTC to RBTC to pay for smart contract interactions on Rootstock — similar to how ETH is used for gas on Ethereum. RBTC can be obtained through the Rootstock bridge, decentralized exchanges on the sidechain, or platforms like BitTasker that integrate Rootstock natively. The bridge mechanism involves locking BTC on Bitcoin's main chain and minting equivalent RBTC on Rootstock, with the reverse process burning RBTC and releasing BTC."
		},
		{
			heading: 'What can you build on Rootstock?',
			body: "Rootstock supports the full range of decentralized applications possible on Ethereum — DeFi protocols, NFT marketplaces, DAOs, lending platforms, and token issuance. Because it's EVM-compatible, developers can use existing Ethereum tooling: Hardhat, Foundry, MetaMask, OpenZeppelin libraries, and the entire Solidity ecosystem. The key differentiator is that all of this runs with Bitcoin's security model rather than Ethereum's separate proof-of-stake consensus. Notable projects on Rootstock include Sovryn (DeFi), Money on Chain (stablecoins), and Rootstock Collective (DAO governance)."
		},
		{
			heading: 'How does Rootstock compare to Ethereum for smart contracts?',
			body: "The fundamental difference is security inheritance. Ethereum smart contracts rely on Ethereum's own validator set and consensus mechanism. Rootstock contracts are ultimately backed by Bitcoin's hash rate through merged mining. Rootstock also offers significantly lower transaction fees — typically fractions of a cent compared to Ethereum's variable gas fees that can spike during congestion. The tradeoff is ecosystem size: Ethereum has far more total value locked, developer tooling, and network effects. However, Rootstock's TVL has grown steadily, and its EVM compatibility means developers face minimal friction when deploying existing Ethereum contracts on Rootstock."
		},
		{
			heading: 'How does BitTasker use Rootstock?',
			body: "BitTasker uses Rootstock smart contracts for escrow and milestone-based payments on the freelance platform. When a client hires a freelancer, project funds are deposited into a Rootstock escrow contract that enforces payment terms in code. The contract releases funds when milestones are approved, and follows predefined dispute resolution rules if disagreements arise. Because Rootstock is EVM-compatible, BitTasker's escrow contracts are auditable and use standard Solidity patterns. This gives freelancers and clients the security of Bitcoin-backed smart contracts without the high fees or complexity of mainnet Ethereum."
		}
	],
	faq: [
		{
			question: 'Is Rootstock really a Bitcoin Layer 2?',
			answer:
				"Rootstock is technically a sidechain — a separate blockchain connected to Bitcoin via a two-way peg and secured through merged mining. Some people colloquially refer to it as a Layer 2 because it extends Bitcoin's functionality and derives security from it. The distinction matters technically but Rootstock serves the same purpose as Layer 2s: adding capabilities to Bitcoin without altering the base chain."
		},
		{
			question: 'How much TVL does Rootstock have?',
			answer:
				"Rootstock has consistently held over $235M in total value locked (TVL) across its DeFi and dApp ecosystem. While smaller than Ethereum's TVL, it represents the largest smart contract ecosystem directly anchored to Bitcoin's security model."
		},
		{
			question: 'What gas does Rootstock use?',
			answer:
				'Rootstock uses RBTC (Rootstock Bitcoin) for gas — the fee paid to process transactions and smart contract interactions. RBTC is pegged 1:1 to BTC and can be obtained through the Rootstock bridge or integrated platforms. Gas fees on Rootstock are typically under $0.01 per transaction.'
		},
		{
			question: 'Can I deploy Ethereum contracts on Rootstock?',
			answer:
				'Yes. Rootstock is fully EVM-compatible, so Solidity contracts written for Ethereum can be deployed on Rootstock with minimal or no modifications. Developers use the same tools — Hardhat, Foundry, Remix, MetaMask — and the same OpenZeppelin libraries.'
		},
		{
			question: 'How secure is Rootstock compared to Ethereum?',
			answer:
				"Rootstock inherits security from Bitcoin through merged mining, meaning Bitcoin miners validate both chains simultaneously. Bitcoin's hash rate is the highest of any blockchain, giving Rootstock strong security guarantees. However, Ethereum's proof-of-stake validator set is also robust, and the two systems have different trust assumptions."
		},
		{
			question: 'What is the RBTC bridge?',
			answer:
				"The RBTC bridge is the mechanism that converts BTC to RBTC and back. You lock BTC on Bitcoin's main chain through a federation of signers, and equivalent RBTC is minted on Rootstock. The reverse process burns RBTC and releases BTC. This two-way peg lets you move value between Bitcoin and Rootstock securely."
		},
		{
			question: 'Does BitTasker charge extra fees for Rootstock escrow?',
			answer:
				"BitTasker's service fee covers escrow management — there are no additional charges for using Rootstock smart contracts. Rootstock network fees for individual transactions are minimal (typically under $0.01), making escrow affordable even for small projects."
		}
	],
	bitTaskerCta: {
		heading: 'Build on Bitcoin with Rootstock smart contracts',
		body: "BitTasker leverages Rootstock's EVM-compatible sidechain for secure, Bitcoin-backed escrow. Every freelance project is protected by smart contracts inheriting Bitcoin's security.",
		buttonText: 'Start a Secure Project',
		buttonHref: '/auth/signup'
	}
};
