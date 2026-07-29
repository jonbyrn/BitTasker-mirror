import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Escrow: Smart Contract Protection',
		subtitle:
			"BitTasker's Rootstock escrow contracts lock funds in auditable code. No platform holds your money — Bitcoin secures every transaction."
	},
	answerBlock:
		"BitTasker's escrow contracts are smart contracts deployed on Rootstock that automatically manage freelance project payments. When a client funds a project, Bitcoin is locked in an auditable smart contract — not in a company's bank account. The contract enforces payment rules: funds release when milestones are approved, and disputes follow transparent on-chain resolution. Both parties can verify the contract code before committing, ensuring no hidden terms. Rootstock's security, backed by Bitcoin's hash rate through merged mining, means escrow funds are protected by the strongest security layer in cryptocurrency. This eliminates platform risk — even if BitTasker goes offline, your escrow funds remain accessible on the Rootstock blockchain.",
	sections: [
		{
			heading: "How does BitTasker's escrow smart contract work?",
			body: "When a client posts a project on BitTasker, they fund the escrow by depositing BTC (converted to RBTC on Rootstock) into a smart contract. The contract specifies the payment conditions — typically, milestone-based delivery with client approval. Once funded, the freelancer can see that funds are locked and verified on-chain. When the freelancer delivers work and the client approves, the smart contract automatically releases payment to the freelancer's wallet. No human at BitTasker touches the funds at any point. The entire flow — from deposit to release — is governed by code that both parties can audit before agreeing."
		},
		{
			heading: 'What guarantees does the smart contract provide?',
			body: "The smart contract provides three guarantees that traditional escrow cannot. First, immutability — once deployed, the contract rules cannot be changed by BitTasker, the client, or anyone else. The code is the final authority. Second, automatic execution — payment is released when conditions are met, without requiring human approval or platform intervention. Third, transparency — both parties can read the contract code on the Rootstock blockchain and verify exactly how their funds will be managed. These guarantees replace corporate trust with mathematical certainty. You don't need to trust BitTasker — you verify the code yourself."
		},
		{
			heading: 'How does fund locking work in BitTasker escrow?',
			body: 'Fund locking in BitTasker escrow works through the smart contract\'s state management. When a client deposits funds, the contract enters a "locked" state where the funds can only be released under the specified conditions. The contract tracks the project status — from "funded" to "in progress" to "completed" or "disputed." At each state, specific actions are permitted: the freelancer can submit delivery evidence, the client can approve or dispute, and the contract can release or hold funds. This state machine ensures that funds move only according to the agreed rules, with each transition recorded on-chain for full auditability.'
		},
		{
			heading: 'How does dispute resolution work?',
			body: "When a client and freelancer disagree on project completion, BitTasker's escrow contract enters dispute mode. Both parties submit evidence through the platform — the freelancer provides proof of delivery, the client provides reasons for rejection. The smart contract then executes the resolution based on predefined rules encoded in the contract. This is not arbitrary — the resolution logic is deterministic and auditable. In cases where the contract cannot determine an outcome (genuine ambiguities), the funds are held until a resolution is reached through the platform's structured process. Neither party can manipulate the outcome once the contract rules are set."
		},
		{
			heading: 'Why is on-chain verification important?',
			body: "On-chain verification means every action in the escrow process is recorded on the Rootstock blockchain and can be independently verified by anyone. Before funding a project, a client can read the smart contract code and confirm exactly how their money will be managed. A freelancer can verify that funds are actually locked in the contract before starting work. After project completion, both parties can confirm the payment release transaction on the blockchain. This level of transparency is impossible with traditional platform escrow, where the company's internal records are the only source of truth. On the blockchain, the code is the only source of truth."
		},
		{
			heading: 'What happens if BitTasker goes offline?',
			body: "Escrow funds exist on the Rootstock blockchain, not on BitTasker's servers. If BitTasker goes offline, the smart contracts continue to function exactly as designed — they are autonomous programs running on the Rootstock network. Users can interact with the contracts directly through Rootstock-compatible wallets or block explorers. Funds can be released when conditions are met, or disputed through the contract's built-in mechanisms, regardless of BitTasker's operational status. This is the fundamental advantage of on-chain escrow: your funds are protected by the blockchain, not by a company's uptime."
		},
		{
			heading: 'How does BitTasker ensure contract security?',
			body: 'BitTasker builds its escrow contracts using established, audited smart contract libraries (OpenZeppelin) and follows industry best practices for contract security. The contract code is published on the Rootstock blockchain for full transparency and auditability. Rootstock itself provides Bitcoin-level security through merged mining, protecting the network from attacks. BitTasker also implements rate limiting, input validation, and access controls within the contracts to prevent common attack vectors. While no smart contract is immune to all risks, the combination of auditable code, Bitcoin-backed security, and established libraries provides the strongest available protection for freelance escrow.'
		}
	],
	faq: [
		{
			question: "How much does BitTasker's escrow cost?",
			answer:
				'BitTasker charges a service fee of 5–10% depending on project size, which covers escrow management, platform use, and dispute resolution. Rootstock network fees for smart contract interactions are minimal (typically under $0.01). There are no separate escrow fees on top of the service fee.'
		},
		{
			question: 'Can I verify the escrow contract before funding?',
			answer:
				'Yes. The escrow smart contract code is published on the Rootstock blockchain. You can read and audit the code before committing any funds. This transparency ensures you understand exactly how your money will be managed.'
		},
		{
			question: "What if the freelancer doesn't deliver?",
			answer:
				"If the freelancer fails to deliver, the client can initiate a dispute through the smart contract. The contract holds the funds until the dispute is resolved according to its predefined rules. The client's funds are not released until delivery is confirmed or a dispute resolution outcome is reached."
		},
		{
			question: 'Is my escrow fund safe from hacks?',
			answer:
				"Escrow funds are protected by Rootstock's Bitcoin-secured network through merged mining. Smart contract code is auditable and built using established libraries. While no system is 100% immune to risk, the combination of Bitcoin-level security and auditable code provides strong protection."
		},
		{
			question: 'Can I use BitTasker escrow for any type of project?',
			answer:
				"Yes. BitTasker escrow works for any freelance project — fixed-price, hourly, or milestone-based. The smart contract is configured to match the project's payment structure and terms."
		},
		{
			question: 'How is this different from Upwork or Fiverr escrow?',
			answer:
				"Traditional platform escrow holds your funds in the company's bank accounts. BitTasker escrow holds funds in a public smart contract on the Rootstock blockchain. No company controls the funds — code does. If BitTasker goes offline, escrow funds remain accessible on-chain."
		}
	],
	bitTaskerCta: {
		heading: 'Protect your next project with code, not trust',
		body: "BitTasker's Rootstock escrow contracts replace corporate trust with auditable smart contracts. Your money is secured by Bitcoin's hash rate — not a company's bank account.",
		buttonText: 'Start a Secure Project',
		buttonHref: '/auth/signup'
	}
};
