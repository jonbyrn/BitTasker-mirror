import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Wallet: Bitcoin Freelance Payments',
		subtitle: 'Connect your wallet, get paid in Bitcoin — with escrow protection on every job'
	},
	answerBlock:
		'BitTasker Wallet is the integrated payment system that powers the BitTasker freelance platform. It connects your existing Bitcoin wallet — whether MetaMask, Ledger, Trezor, or any WalletConnect-compatible app — to receive and send payments across Bitcoin, Lightning, and Rootstock (RBTC). Every transaction is protected by smart contract escrow on the Rootstock network, ensuring that funds are only released when work is approved. You stay in control of your keys at all times — BitTasker never holds your Bitcoin. This self-custodial model combined with smart contract escrow protection gives freelancers and clients the security of traditional escrow with the speed and low fees of Bitcoin.',
	sections: [
		{
			heading: 'How Does BitTasker Wallet Integration Work?',
			body: "BitTasker does not force you to use a proprietary wallet. Instead, it connects to the wallet you already own through WalletConnect, MetaMask, Ledger, or Trezor. When you create a BitTasker account, you link your preferred wallet. When a client hires you, they fund an escrow smart contract on the Rootstock network with RBTC (Rootstock Bitcoin). When you complete the work and the client approves it, the smart contract automatically releases payment to your wallet. If there is a dispute, BitTasker's resolution system handles it before funds are released. This model means you never deposit Bitcoin into BitTasker — the platform is a coordination and escrow layer, not a custodian."
		},
		{
			heading: 'What Wallets Does BitTasker Support?',
			body: 'BitTasker supports the most popular Bitcoin and Ethereum-compatible wallets through WalletConnect and direct integration. MetaMask is the primary option for Web3 users, connecting directly to BitTasker for Rootstock (RBTC) transactions. Ledger and Trezor hardware wallets are supported for users who want cold storage security with their BitTasker account. Any WalletConnect-compatible wallet — including Rainbow, Trust Wallet, and Frame — can connect to the platform. For Lightning payments, BitTasker integrates with Lightning-enabled wallets like Blink and Aqua, allowing instant BTC payouts. This multi-wallet approach means you can use whichever wallet fits your workflow, without compromising on security or convenience.'
		},
		{
			heading: 'What Is Escrow Protection via Rootstock Smart Contracts?',
			body: "Every gig on BitTasker is backed by a smart contract escrow on the Rootstock (RSK) network, a Bitcoin sidechain that supports Ethereum-compatible smart contracts. When a client creates a job, they lock payment in a smart contract. The funds are held by the contract — not by BitTasker — until the freelancer completes the work and the client approves it. If both parties agree, payment is released automatically. If there is a disagreement, BitTasker's dispute resolution process mediates before any funds move. This eliminates the trust problem in freelance work: freelancers are guaranteed payment for completed work, and clients only pay for work they approve. The Rootstock network uses RBTC (pegged 1:1 to Bitcoin) for transactions, keeping fees low while inheriting Bitcoin's security model."
		},
		{
			heading: 'Can I Buy, Sell, and Swap Crypto on BitTasker?',
			body: "Yes. BitTasker's wallet integration supports buying, selling, and swapping between Bitcoin, Lightning, and RBTC. You can buy Bitcoin directly through integrated on-ramp services, convert between on-chain BTC and Lightning for different use cases, or swap between BTC and RBTC for Rootstock smart contract interactions. These features are built into the platform so you do not need to use a separate exchange. The self-custodial model means all swaps happen from your connected wallet — BitTasker never takes custody of your funds during the process. This is particularly useful for freelancers who receive payment in one format (e.g., Lightning) but want to hold savings in another (e.g., on-chain BTC or RBTC)."
		},
		{
			heading: 'Is BitTasker Wallet Self-Custodial?',
			body: "Yes, BitTasker follows a self-custodial model. You connect your own wallet — whether MetaMask, Ledger, Trezor, or a WalletConnect-compatible app — and you retain full control of your private keys at all times. BitTasker never holds, manages, or has access to your Bitcoin. The platform operates as a coordination and escrow layer: smart contracts on Rootstock hold funds temporarily during active jobs, but these contracts are on-chain and verifiable. When work is approved, funds move directly to your wallet. When no jobs are active, your Bitcoin sits in your wallet, not on BitTasker's servers. This is the fundamental difference between BitTasker and traditional freelance platforms, which hold your earnings in their own accounts until you withdraw."
		},
		{
			heading: 'How Do Lightning Payments Work on BitTasker?',
			body: 'BitTasker supports Lightning Network for instant, low-fee payments. When a client approves your work, you can receive payment over Lightning instead of waiting for on-chain confirmation. Lightning payments on BitTasker settle in seconds with negligible fees — typically fractions of a cent. To receive Lightning payments, connect a Lightning-compatible wallet like Blink Wallet or Aqua Wallet to your BitTasker account. You can also receive payments on-chain (Bitcoin mainnet) or via RBTC on Rootstock, depending on your preference. The Lightning option is especially valuable for smaller payments, tips, and frequent transactions where on-chain fees would eat into your earnings. BitTasker also supports escrow protection on Lightning payments, ensuring that even instant payouts are secure.'
		}
	],
	faq: [
		{
			question: 'Does BitTasker hold my Bitcoin?',
			answer:
				'No. BitTasker is non-custodial. You connect your own wallet (MetaMask, Ledger, Trezor, or WalletConnect-compatible) and retain full control of your keys. BitTasker never holds your Bitcoin — smart contracts on Rootstock temporarily hold escrow funds during active jobs.'
		},
		{
			question: 'What happens if a client disputes my work on BitTasker?',
			answer:
				"BitTasker has a dispute resolution system. If a client disputes your work, the escrow smart contract holds the funds until both parties reach an agreement or BitTasker's resolution process makes a determination. Your payment is protected — clients cannot withdraw escrowed funds without completing the dispute process."
		},
		{
			question: 'Can I use any Bitcoin wallet with BitTasker?',
			answer:
				'BitTasker supports MetaMask, Ledger, Trezor, and any WalletConnect-compatible wallet. For Lightning payments, use Blink Wallet, Aqua Wallet, or any Lightning-enabled wallet. The platform is designed to work with the wallet you already own.'
		},
		{
			question: 'What is Rootstock and why does BitTasker use it?',
			answer:
				"Rootstock (RSK) is a Bitcoin sidechain that supports Ethereum-compatible smart contracts. BitTasker uses Rootstock for escrow smart contracts because it inherits Bitcoin's security model while enabling programmable escrow logic. Transactions use RBTC, pegged 1:1 to Bitcoin."
		},
		{
			question: 'How much does it cost to use BitTasker Wallet?',
			answer:
				'BitTasker does not charge fees for connecting your wallet or receiving payments. Standard network fees apply: Bitcoin on-chain fees, Lightning fees (negligible), or Rootstock transaction fees. Escrow smart contract interactions on Rootstock have low fees compared to Ethereum.'
		},
		{
			question: 'Can I receive payments in both Bitcoin and RBTC?',
			answer:
				'Yes. BitTasker supports payments in Bitcoin (on-chain and Lightning) and RBTC (Rootstock). You can choose your preferred payment method when setting up your profile, and clients can pay using whichever method suits them.'
		}
	],
	bitTaskerCta: {
		heading: 'Connect Your Wallet and Start Earning',
		body: 'Sign up for BitTasker, connect your preferred Bitcoin wallet, and start receiving escrow-protected freelance payments in BTC, Lightning, or RBTC.',
		buttonText: 'Create Your Account',
		buttonHref: '/auth/signup'
	}
};
