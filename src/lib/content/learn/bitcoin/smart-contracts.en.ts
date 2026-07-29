import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: "Bitcoin Smart Contracts: What's Possible in 2026",
		subtitle:
			"Rootstock, Stacks, and Ordinals bring programmable money to Bitcoin. Here's how they work."
	},
	answerBlock:
		"Bitcoin does support smart contracts, but through Layer 2 solutions rather than on the base chain. The most established is Rootstock (RSK), an EVM-compatible sidechain merged-mined with Bitcoin that brings full Solidity smart contract capability to the Bitcoin ecosystem. Stacks brings smart contracts via its Proof-of-Transfer consensus, and Ordinals introduced data inscription directly on satoshis. For freelancers and platforms, Rootstock is the most practical option — it offers Ethereum-compatible smart contracts backed by Bitcoin's security model, enabling escrow, lending, and decentralized exchange without leaving the Bitcoin ecosystem. BitTasker uses Rootstock smart contracts to power its trustless escrow system.",
	sections: [
		{
			heading: 'Can Bitcoin have smart contracts?',
			body: "Bitcoin has always had a limited form of smart contracts through Bitcoin Script — the simple programming language that governs how transactions can be spent. Scripts enable multi-signature wallets, time-locked transactions, and basic conditional payments. However, Bitcoin Script is intentionally limited for security reasons, lacking the Turing-completeness of languages like Solidity. To bring full smart contract capability to Bitcoin, developers built Layer 2 solutions: Rootstock (RSK) for EVM compatibility, Stacks for a Bitcoin-native programming environment (Clarity), and Ordinals/Inscriptions for embedding data directly on-chain. Each approach trades off different properties — security, compatibility, decentralization — but all expand what's possible on Bitcoin beyond simple value transfer."
		},
		{
			heading: 'What is Rootstock and EVM compatibility?',
			body: "Rootstock (RSK) is a Bitcoin sidechain that brings Ethereum Virtual Machine (EVM) compatibility to the Bitcoin ecosystem. This means developers can write smart contracts in Solidity — the same language used on Ethereum — and deploy them on a network secured by Bitcoin's hash rate through merged mining. Rootstock processes transactions faster and cheaper than Ethereum while inheriting Bitcoin's security guarantees. For the Bitcoin ecosystem, this is transformative: it means any Ethereum dApp (decentralized application) can be ported to run on Bitcoin's security model. Bridges allow BTC to move between the Bitcoin mainchain and Rootstock, where it becomes RBTC (Rootstock Bitcoin) for use in smart contracts. BitTasker uses this bridge to enable escrow contracts that hold real Bitcoin value in auditable code."
		},
		{
			heading: "Bitcoin Script vs Solidity: what's the difference?",
			body: "Bitcoin Script is a stack-based, non-Turing-complete language designed for simplicity and security. It can verify signatures, enforce time locks, and check conditions — but it can't loop indefinitely or make external calls. This limitation is intentional: complex scripts increase attack surface and can introduce vulnerabilities. Solidity, used on Ethereum and Rootstock, is Turing-complete and far more expressive. It supports complex data structures, inheritance, external contract calls, and event logging. For simple payments and basic conditions, Bitcoin Script is sufficient and more secure. For complex logic like escrow with dispute resolution, automated lending, or decentralized exchanges, Solidity on Rootstock provides the flexibility needed while still being secured by Bitcoin's hash rate."
		},
		{
			heading: 'What are smart contract use cases on Bitcoin?',
			body: "Smart contracts on Bitcoin enable several practical applications. Escrow services lock funds in code until conditions are met — BitTasker uses this for freelance project payments. Lending protocols allow Bitcoin holders to lend BTC and earn interest, or borrow against their holdings. Decentralized exchanges (DEXs) enable peer-to-peer trading without a central order book. Tokenization platforms create digital assets on Bitcoin's security model. DAOs (decentralized autonomous organizations) can govern shared treasuries with transparent voting. For freelancers specifically, escrow is the most impactful use case: smart contracts that automatically release payment when work is approved, without requiring trust in any platform or intermediary."
		},
		{
			heading: 'What are Ordinals and Bitcoin inscriptions?',
			body: "Ordinals, launched in early 2023, introduced a way to inscribe data directly onto individual satoshis — the smallest unit of Bitcoin. This effectively brought NFTs, tokens, and other data to Bitcoin's base layer without requiring a sidechain or Layer 2. Each satoshi can carry up to 4 MB of data through a mechanism called \"envelopes.\" While controversial in the Bitcoin community (some view it as spamming the blockchain), Ordinals demonstrated that Bitcoin's base layer can support more than just financial transactions. For smart contracts, Ordinals are less practical than Rootstock or Stacks — they don't enable programmable logic, only data storage. However, they expanded the conversation about Bitcoin's capabilities and attracted new developers to the ecosystem."
		},
		{
			heading: 'How does BitTasker use Rootstock smart contracts for escrow?',
			body: "BitTasker's escrow system runs on Rootstock smart contracts, combining Bitcoin's security with EVM programmability. When a client hires a freelancer, project funds are deposited into a Rootstock smart contract that enforces the agreed payment terms. The contract holds funds until both parties confirm completion or a dispute is resolved through predefined rules. Because Rootstock is merged-mined with Bitcoin, these escrow contracts benefit from the same hash rate that secures Bitcoin itself. For freelancers, this means escrow funds aren't held by BitTasker or any company — they're locked in auditable code on a Bitcoin-secured blockchain. If BitTasker went offline, the escrow contracts would remain functional and accessible through the Rootstock network."
		},
		{
			heading: 'What are the risks and limitations of Bitcoin smart contracts?',
			body: "Bitcoin smart contracts through Layer 2 solutions carry inherent risks. Sidechains like Rootstock require trust in the bridge mechanism that moves BTC between chains — bridge exploits have been among the most costly attacks in crypto. Stacks' Proof-of-Transfer introduces its own consensus assumptions. Ordinals data is stored on Bitcoin's base chain, increasing transaction fees during high-demand periods. For developers, the fragmented landscape means no single standard for Bitcoin smart contracts — choosing Rootstock vs Stacks vs Ordinals involves trade-offs in security, compatibility, and ecosystem maturity. For users, the key risk is understanding which layer their assets are on and what guarantees apply. Rootstock offers the strongest security model among the options due to merged mining, but users should always verify they're interacting with legitimate contracts."
		}
	],
	faq: [
		{
			question: 'Does Bitcoin support smart contracts natively?',
			answer:
				'Bitcoin supports basic smart contracts through Bitcoin Script on the base layer — multi-signature, time locks, and conditional payments. For complex smart contracts (escrow, lending, DEX), Layer 2 solutions like Rootstock and Stacks bring full programmability to the Bitcoin ecosystem.'
		},
		{
			question: 'What is the best platform for Bitcoin smart contracts?',
			answer:
				"Rootstock is currently the most established platform for Bitcoin smart contracts, offering EVM compatibility and security backed by Bitcoin's hash rate through merged mining. It supports Solidity, making it accessible to the large pool of Ethereum developers. Stacks offers a Bitcoin-native alternative with its Clarity language."
		},
		{
			question: 'Are Bitcoin smart contracts as secure as Ethereum?',
			answer:
				"Rootstock smart contracts are secured by Bitcoin's hash rate through merged mining, making them arguably more secure than Ethereum's separate consensus mechanism. However, the bridge between Bitcoin and Rootstock introduces additional trust assumptions. Ethereum smart contracts benefit from a longer track record and larger audit ecosystem."
		},
		{
			question: 'Can I use Bitcoin smart contracts without technical knowledge?',
			answer:
				'Yes. Platforms like BitTasker handle the smart contract complexity behind the escrow interface. You interact with a simple web or mobile interface, while the Rootstock smart contract manages fund locking, release conditions, and dispute resolution automatically.'
		},
		{
			question: 'What are the fees for Bitcoin smart contracts?',
			answer:
				"Rootstock transaction fees are typically under $0.01, significantly lower than Ethereum gas fees. Smart contract deployment costs more depending on contract complexity, but user interactions (depositing escrow, releasing funds) are minimal. BitTasker's service fee covers all smart contract interaction costs."
		},
		{
			question: 'How do I move Bitcoin to Rootstock for smart contracts?',
			answer:
				"You bridge BTC to Rootstock using a bridge service, which locks your BTC on the mainchain and mints an equivalent amount of RBTC on Rootstock. BitTasker handles this bridging automatically when you deposit escrow funds, so you don't need to manage the technical bridging process yourself."
		}
	],
	bitTaskerCta: {
		heading: 'Experience trustless escrow with Bitcoin smart contracts',
		body: "BitTasker's Rootstock-powered escrow puts your freelance payments in auditable code, not corporate bank accounts. Bitcoin security meets smart contract flexibility.",
		buttonText: 'Try Smart Contract Escrow',
		buttonHref: '/auth/signup'
	}
};
