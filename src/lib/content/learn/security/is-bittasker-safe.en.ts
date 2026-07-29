import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Is BitTasker Safe? Security & Trust Explained',
		subtitle:
			'How audited smart contracts, Nostr identity, and self-custody protect your freelancing earnings'
	},
	answerBlock:
		"BitTasker is built on audited Rootstock smart contracts, Nostr-based decentralized identity, and Bitcoin/Lightning self-custody payments — meaning the platform never holds your money. Escrow is enforced by code on the Rootstock blockchain, not by a company's bank account. Your identity is a Nostr keypair you control, not an email/password tied to a central database. Payments flow directly between clients and freelancers via Lightning Network, with no fiat intermediary. This is fundamentally safer than traditional platforms (Upwork, Fiverr) where the company custodies funds and controls account access. However, BitTasker carries crypto-specific risks: Bitcoin price volatility, smart contract execution risk, and the irreversibility of blockchain transactions. For freelancers comfortable with Bitcoin, BitTasker offers a trust-minimized alternative to centralized platforms.",
	sections: [
		{
			heading: 'How does BitTasker protect your earnings?',
			body: "BitTasker uses a three-layer security model. Layer 1: Rootstock smart contract escrow. When a client hires you and funds a task, the Bitcoin is locked in an audited smart contract on the Rootstock blockchain — not in BitTasker's bank account or any centralized custody. The contract enforces the agreed terms: funds are released to the freelancer when work is approved, or returned to the client if the task is cancelled. No single party (including BitTasker) can move the escrowed funds unilaterally. Layer 2: Nostr identity. Your account is a cryptographic keypair, not an email/password stored in a company database. There is no central database to hack, no passwords to leak, and no account to suspend without your cryptographic consent. Layer 3: Lightning Network payments. When the client releases payment, Bitcoin flows directly to your connected wallet via Lightning — settling in seconds with minimal fees. BitTasker never custodies the funds."
		},
		{
			heading: "Is BitTasker's smart contract audited?",
			body: "Yes, BitTasker's Rootstock escrow contracts have been audited by independent security firms. The audits examine the contract logic for vulnerabilities including reentrancy attacks, integer overflow, unauthorized fund withdrawal, and edge cases in the escrow lifecycle. The audit reports are published for transparency. Rootstock itself is a Bitcoin sidechain secured by merged mining with Bitcoin miners, inheriting Bitcoin's security model. Smart contracts on Rootstock execute with the same cryptographic guarantees as Bitcoin transactions. While no smart contract is 100% risk-free, the combination of formal audits, open-source code, and Rootstock's Bitcoin-secured consensus provides a high level of assurance."
		},
		{
			heading: 'How does BitTasker compare to Upwork and Fiverr?',
			body: "The fundamental difference is custody. Upwork and Fiverr hold your earnings in company-controlled accounts. They can freeze your account, delay withdrawals, impose mandatory holding periods, and take 10–20% in fees. If the company has financial trouble, your earnings could be at risk. BitTasker uses decentralized escrow — your earnings are locked in a smart contract, not a company bank account. The platform charges 5% (half of Upwork's 10%). Payments arrive in seconds via Lightning, not 5–10 business days. Your identity is a Nostr keypair — no company can suspend your account without your cryptographic consent. The tradeoff: BitTasker is newer, smaller, and requires comfort with Bitcoin and self-custody. Traditional platforms offer more established marketplaces and fiat payment options."
		},
		{
			heading: 'What are the risks of using BitTasker?',
			body: "BitTasker carries specific risks that traditional platforms do not. First, Bitcoin price volatility: your earnings are in Bitcoin, which can fluctuate significantly in value. You can mitigate this by converting to stablecoins or fiat immediately after receiving payment. Second, smart contract risk: while audited, smart contracts can have undiscovered vulnerabilities. The risk is mitigated by Rootstock's Bitcoin-secured consensus and formal audits. Third, irreversible transactions: Bitcoin transactions cannot be reversed. If you send to a wrong address or fall for a phishing attack, the funds are lost. Fourth, self-custody responsibility: if you lose your seed phrase, there is no account recovery. These risks are manageable with proper security practices, but they exist and should be understood before using the platform."
		},
		{
			heading: 'How does Nostr identity make BitTasker more secure?',
			body: "Traditional platforms use email/password authentication tied to a central database. If that database is breached (common — LinkedIn, Adobe, Dropbox have all been breached), your credentials are compromised. BitTasker uses Nostr keypairs — cryptographic identities you generate locally on your device. Your private key never touches BitTasker's servers. There is no central database of passwords to hack. Authentication is cryptographic: you sign messages with your private key, and the platform verifies with your public key. This is the same security model used by Bitcoin itself. If BitTasker's servers are compromised, the attacker gets nothing useful — no passwords, no session tokens, no way to impersonate users."
		},
		{
			heading: 'How are disputes handled on BitTasker?',
			body: "Disputes are resolved through the smart contract's built-in escrow mechanism. When a task is created, both parties agree on terms that are encoded in the smart contract. If the client approves the work, funds release to the freelancer. If there is a disagreement, the smart contract supports a dispute resolution process. Unlike Upwork, where dispute resolution involves company arbitrators who can take weeks, BitTasker's process is transparent and governed by code. The specific dispute resolution mechanism is defined in the smart contract and operates on the Rootstock blockchain, where all actions are publicly verifiable."
		},
		{
			heading: 'Is my personal data safe on BitTasker?',
			body: 'BitTasker collects minimal personal data by design. Your identity is a Nostr keypair — no email required for basic functionality. Payment history is on-chain (pseudonymous by design on Bitcoin/Rootstock). The platform does not store your private keys, seed phrases, or financial credentials. No KYC (Know Your Customer) is required for basic platform use. This is a privacy advantage over traditional platforms that collect extensive personal information, employment history, tax details, and bank account information — all stored in centralized databases that can be breached.'
		}
	],
	faq: [
		{
			question: 'Is BitTasker legitimate?',
			answer:
				'Yes, BitTasker is a real freelancing platform built on Bitcoin, Rootstock smart contracts, and the Nostr protocol. It charges a 5% platform fee and uses decentralized escrow to protect both freelancers and clients.'
		},
		{
			question: 'Can BitTasker freeze my account?',
			answer:
				'No, BitTasker cannot freeze your Nostr identity or prevent you from receiving payments. Your identity is a cryptographic keypair you control. The platform can restrict access to its interface, but your wallet connection and payment capability remain intact.'
		},
		{
			question: 'What happens if BitTasker shuts down?',
			answer:
				"Your Bitcoin is safe. Escrowed funds are locked in Rootstock smart contracts, not BitTasker's bank account. If the platform shuts down, the smart contracts continue to operate on the Rootstock blockchain, and you can interact with them directly."
		},
		{
			question: 'Do I need to know Bitcoin to use BitTasker?',
			answer:
				'You need a basic understanding of Bitcoin wallets and Lightning payments. BitTasker guides you through wallet setup, but you are responsible for managing your own keys. This is the tradeoff for decentralized, trust-minimized freelancing.'
		},
		{
			question: 'How much does BitTasker charge?',
			answer:
				"BitTasker charges a flat 5% platform fee — half of Upwork's 10%. There are no connect fees, no bidding costs, and no hidden charges. Lightning network fees for payments are minimal (typically less than 1%)."
		},
		{
			question: 'Is my money safe in BitTasker escrow?',
			answer:
				'Escrowed funds are locked in audited Rootstock smart contracts secured by Bitcoin merged mining. No single party — including BitTasker — can move the funds unilaterally. Funds release only when both parties fulfill the agreed terms.'
		},
		{
			question: "What happens if a client doesn't release payment?",
			answer:
				'The smart contract enforces the escrow terms. If the client funded the escrow and you completed the work, the contract provides a mechanism for payment release. If the client is unresponsive, the dispute resolution process in the smart contract addresses this.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelance with Confidence on BitTasker',
		body: 'Audited smart contracts, Nostr identity, and self-custody payments protect your earnings. No central authority controls your money or identity. This is freelancing without the platform risk.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
