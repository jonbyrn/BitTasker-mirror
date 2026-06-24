import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Stacks: Bitcoin Layer 2 for Smart Contracts & DeFi',
		subtitle:
			'Clarity language, Proof of Transfer consensus, sBTC. Learn how Stacks brings programmable finance to Bitcoin.'
	},
	answerBlock:
		"Stacks is a Bitcoin Layer 2 that enables smart contracts, DeFi, and dApps anchored to Bitcoin's security. Unlike sidechains that run parallel to Bitcoin, Stacks settles its transactions on Bitcoin itself — each Stacks block is anchored to a Bitcoin block. Stacks uses Clarity, a decidable smart contract language that prevents entire classes of bugs, and Proof of Transfer (PoX) consensus that recycles BTC as the economic backbone. The Nakamoto upgrade brings dramatically faster block times and sBTC — a decentralized, Bitcoin-pegged token that enables full programmable Bitcoin in smart contracts.",
	sections: [
		{
			heading: 'What is Stacks?',
			body: "Stacks is a Layer 2 network that extends Bitcoin's functionality by enabling smart contracts and decentralized applications. Unlike traditional Layer 2s that process transactions off-chain and batch them to the base layer, Stacks transactions are settled on Bitcoin itself. Every Stacks block includes a hash of the corresponding Bitcoin block, creating a cryptographic anchor. This means Stacks inherits Bitcoin's security for transaction finality — once a Stacks transaction is confirmed and its Bitcoin anchor is buried under enough blocks, it has the same security as a Bitcoin transaction. Stacks launched its mainnet in January 2021 and has grown to support a range of DeFi protocols, NFT platforms, and DAOs."
		},
		{
			heading: 'What is Clarity and why does it matter?',
			body: "Clarity is the smart contract language used on Stacks, designed specifically for safety and predictability. Unlike Solidity (used on Ethereum and Rootstock), Clarity is decidable — the language guarantees that any contract's execution path can be determined at compile time without running it. This eliminates entire categories of bugs like reentrancy attacks, integer overflow, and unbounded loops that plague Solidity contracts. Clarity is also interpreted rather than compiled, meaning the source code is stored on-chain and auditable by anyone. For financial applications where bugs can mean loss of funds, Clarity's safety guarantees provide significant risk reduction."
		},
		{
			heading: 'What is Proof of Transfer (PoX)?',
			body: "Proof of Transfer is Stacks' consensus mechanism, unique in the blockchain space. Miners commit BTC to participate in block production — they send BTC to existing STX holders as a participation cost. This creates a direct economic link between Stacks and Bitcoin: miners spend real BTC to earn the right to mine STX blocks and collect transaction fees. STX holders who receive these BTC rewards are called Stackers, and they can lock their STX to participate in consensus and earn Bitcoin yield. PoX is considered an evolution of Proof of Work — instead of burning electricity, miners burn an already-secured asset (BTC), making the consensus mechanism economically efficient."
		},
		{
			heading: 'What is the Nakamoto upgrade?',
			body: "The Nakamoto upgrade is the most significant improvement to Stacks since its launch. It introduces several critical changes: faster block times (from ~10 minutes to seconds), stronger Bitcoin finality guarantees, and the infrastructure for sBTC. Before Nakamoto, Stacks block production depended on Bitcoin's 10-minute block interval. After Nakamoto, Stacks processes blocks independently and only anchors to Bitcoin for finality, dramatically improving transaction speed. The upgrade also brings miner independence — block production no longer stalls when Bitcoin blocks are delayed. Nakamoto rolled out in stages through 2024, with full activation completed in late 2024."
		},
		{
			heading: 'What is sBTC?',
			body: 'sBTC is a decentralized, programmable token pegged 1:1 to BTC, built on the Stacks Layer 2. Unlike wrapped Bitcoin on Ethereum (WBTC), which relies on centralized custodians, sBTC is backed by a decentralized network of signers and secured by Bitcoin through the Stacks protocol. sBTC enables Bitcoin to be used directly in smart contracts on Stacks — for DeFi lending, AMMs, NFT purchases, and any application that needs programmable BTC. The sBTC bridge is open and decentralized, meaning anyone can mint or redeem sBTC without relying on a company. This is a fundamental advancement for Bitcoin programmability.'
		},
		{
			heading: 'What can you build on Stacks?',
			body: "Stacks supports a growing ecosystem of decentralized applications. DeFi platforms like ALEX and Arkadiko offer lending, borrowing, and AMM trading. The NFT ecosystem on Stacks includes marketplaces like Gamma and HeyAlfred. DAOs use Stacks for governance and treasury management. Because Stacks settles on Bitcoin, all of these applications benefit from Bitcoin's security model. The Clarity language makes Stacks particularly suited for financial applications where contract correctness is critical. The combination of Bitcoin security, Clarity safety, and sBTC programmability creates a unique value proposition for building on Bitcoin."
		},
		{
			heading: 'How does Stacks compare to Rootstock for Bitcoin smart contracts?',
			body: 'Both Stacks and Rootstock bring smart contracts to Bitcoin, but with different approaches. Stacks settles transactions directly on Bitcoin and uses its own language (Clarity) designed for safety. Rootstock runs as a parallel sidechain with EVM compatibility and merged mining. Stacks has the Nakamoto upgrade for faster blocks and sBTC for programmable Bitcoin. Rootstock has EVM tooling and a larger existing TVL. For developers, the choice often comes down to language preference (Clarity vs Solidity), consensus model (PoX vs merged mining), and specific feature needs like sBTC.'
		}
	],
	faq: [
		{
			question: 'What is the STX token?',
			answer:
				'STX (Stacks) is the native token of the Stacks Layer 2 network. It is used for gas fees, smart contract deployment, and participating in Proof of Transfer consensus. STX holders can lock their tokens to earn Bitcoin yield through the PoX mechanism.'
		},
		{
			question: 'How fast are Stacks transactions after Nakamoto?',
			answer:
				'After the Nakamoto upgrade, Stacks blocks are produced in seconds rather than the previous ~10 minute intervals tied to Bitcoin blocks. While finality still depends on Bitcoin block confirmations, the user experience is dramatically faster for everyday transactions.'
		},
		{
			question: 'Is sBTC the same as WBTC?',
			answer:
				'No. WBTC (Wrapped Bitcoin on Ethereum) is custodied by BitGo and relies on a centralized bridge. sBTC is a decentralized, protocol-level token secured by the Stacks network and Bitcoin. sBTC can be minted and redeemed by anyone through the decentralized signer network.'
		},
		{
			question: 'How does Clarity prevent smart contract bugs?',
			answer:
				'Clarity is decidable — the compiler can determine every possible execution path without running the contract. This prevents unbounded loops, reentrancy attacks, and integer overflow bugs. It is also interpreted, so source code is stored on-chain and fully auditable.'
		},
		{
			question: 'Can I use Stacks for DeFi?',
			answer:
				'Yes. Stacks has a growing DeFi ecosystem including lending protocols (Arkadiko), AMMs (ALEX), and stablecoin platforms. sBTC enables Bitcoin-backed DeFi where users can lend, borrow, and trade using BTC programmatically.'
		},
		{
			question: 'How does Proof of Transfer work?',
			answer:
				'Miners commit BTC to participate in block production. The BTC is sent to STX holders who are stacking (locking) their tokens. This creates a direct economic link between Stacks and Bitcoin — miners spend real BTC, and STX holders earn Bitcoin yield.'
		},
		{
			question: 'Is Stacks secure?',
			answer:
				"Stacks settles on Bitcoin, meaning transaction finality is anchored to Bitcoin's blockchain. Once a Stacks transaction's Bitcoin anchor is confirmed under sufficient blocks, it has the same security as a Bitcoin transaction. The Nakamoto upgrade strengthened these finality guarantees."
		}
	],
	bitTaskerCta: {
		heading: 'Build decentralized freelancing on Bitcoin with Stacks',
		body: "BitTasker explores Stacks for DeFi-powered escrow and programmable payments anchored directly to Bitcoin. Clarity's safety model ensures reliable smart contracts for freelance work.",
		buttonText: 'Start Building',
		buttonHref: '/auth/signup'
	}
};
