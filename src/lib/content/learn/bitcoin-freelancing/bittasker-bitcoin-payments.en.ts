import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Bitcoin Payments: How Freelancers Get Paid',
		subtitle:
			'BTC, Lightning, RBTC, and stablecoins — instant payouts with Rootstock escrow protection.'
	},
	answerBlock:
		'BitTasker pays freelancers in Bitcoin using a multi-currency payment system built for the global freelance economy. Supported currencies include BTC on-chain, Lightning Network for instant payouts, RBTC on Rootstock for smart contract escrow, and stablecoins (USDC) for dollar-denominated payments. When a client approves completed work, funds release from a Rootstock smart contract and arrive in your wallet via Lightning in seconds. Escrow protection is enforced by auditable smart contracts merged-mined with Bitcoin. Fees are tiered based on loyalty — the more projects you complete, the less you pay. Every payment is self-custodial: you connect your own wallet, and BitTasker never holds your funds.',
	sections: [
		{
			heading: 'How do Bitcoin payments work on BitTasker?',
			body: "BitTasker uses a three-step payment flow. Step 1: The client funds a project by depositing cryptocurrency into a Rootstock smart contract escrow. The contract specifies the release conditions — typically milestone approval from the client. Step 2: The freelancer completes the work and submits it for review. Step 3: When the client approves, the smart contract automatically releases payment to the freelancer's connected wallet via Lightning Network. The entire flow — from approval to funds arriving in the freelancer's wallet — takes seconds. There are no batch processing schedules, no minimum payout thresholds, and no withdrawal delays. The smart contract enforces the terms transparently: neither BitTasker, the client, nor the freelancer can unilaterally move the escrowed funds."
		},
		{
			heading: 'What currencies does BitTasker support?',
			body: 'BitTasker accepts and pays out in multiple cryptocurrencies. Bitcoin (BTC) is the primary asset — clients fund escrow in BTC and freelancers receive in BTC. Lightning Network handles instant, low-fee transfers for all payouts. Rootstock Bitcoin (RBTC) is used for smart contract interactions on the Rootstock sidechain. Stablecoins (USDC) are supported for clients who want dollar-denominated escrow — useful for budget predictability. The multi-asset approach means a client in the US can fund escrow in USDC while a freelancer in El Salvador receives payment in BTC via Lightning. The smart contract handles conversion logic between supported currencies.'
		},
		{
			heading: 'How does Rootstock escrow protect my earnings?',
			body: "Every project on BitTasker is protected by Rootstock smart contracts. When a client funds a project, the payment goes into a smart contract on the Rootstock blockchain — not BitTasker's bank account. Rootstock is merged-mined with Bitcoin, meaning these escrow contracts benefit from the same hash rate that secures Bitcoin itself. The contract enforces agreed terms: funds are held until milestones are approved, and disputes follow transparent resolution rules. No single entity — including BitTasker — can freeze, redirect, or manipulate the funds. If BitTasker went offline, the escrow contracts would remain functional and accessible on the Rootstock blockchain. Clients get proof that their funds are secure; freelancers get proof that payment will arrive when they deliver."
		},
		{
			heading: "What is BitTasker's fee structure?",
			body: "BitTasker charges a service fee of 5–10% depending on project type and your loyalty tier. Loyalty tiers reduce your fee rate as you complete more projects on the platform. There are no hidden charges: the service fee covers escrow management, smart contract interactions, Lightning payout routing, and platform use. Rootstock network fees for smart contract interactions are minimal (under $0.01). Lightning transaction fees are similarly negligible. Compared to traditional platforms that charge 10–20% and deduct additional withdrawal fees, BitTasker's transparent, tiered structure means freelancers keep more of their earnings. The loyalty model creates a positive incentive loop: the more you work on BitTasker, the less you pay in fees."
		},
		{
			heading: 'How fast are BitTasker payouts?',
			body: 'BitTasker pays out instantly via Lightning Network. When a client approves your completed work, the payment routes through Lightning and arrives in your connected wallet in seconds — regardless of your country, bank, or time zone. There is no minimum payout amount, no batch processing schedule, and no withdrawal delays. For freelancers who depend on timely payments to manage cash flow, this is transformative. A freelancer in Argentina can complete work at 3 PM and have spendable Bitcoin in their wallet by 3:01 PM. The instant settlement eliminates the "payment anxiety" that plagues traditional freelance relationships, where 14-day holding periods and delayed payouts are the norm.'
		},
		{
			heading: 'How do I connect my wallet to BitTasker?',
			body: 'BitTasker supports self-custodial wallet connections through Nostr Wallet Connect (NWC). You link your Lightning wallet — such as Aqua, Blink, Phoenix, or any NWC-compatible wallet — to your BitTasker account. Once connected, payments route directly to your wallet without BitTasker holding any funds. For clients, BitTasker supports MetaMask, Ledger, Trezor, and WalletConnect for funding escrow on Rootstock. The self-custodial model means you always maintain control of your private keys. BitTasker cannot access, freeze, or move your funds. If you want to switch wallets at any time, you simply disconnect the old one and connect a new one — your earnings and reputation remain intact.'
		},
		{
			heading: 'How do BitTasker payments compare to traditional platform payments?',
			body: 'Traditional freelance platforms (Upwork, Fiverr) operate centralized payment systems: they hold your funds in their bank accounts, process payouts weekly or monthly, and charge fees for withdrawals, currency conversion, and expedited payments. BitTasker is fundamentally different. Escrow exists on-chain in smart contracts, not in corporate bank accounts. Payouts route through Lightning, not bank wire networks. Fees are transparent and tiered, not layered with hidden charges. And because payments are crypto-native, there are no currency conversion markups — you receive exactly what was agreed. The result: faster payouts (seconds vs. 14 days), lower fees (5–10% vs. 10–20%), and no intermediary that can freeze your earnings.'
		}
	],
	faq: [
		{
			question: 'How fast do I get paid on BitTasker?',
			answer:
				'Instantly via Lightning Network. When a client approves your work, payment arrives in your connected wallet within seconds. There are no waiting periods, batch processing, or bank transfer delays.'
		},
		{
			question: "What are BitTasker's fees?",
			answer:
				'BitTasker charges 5–10% depending on project type and loyalty tier. This covers escrow management, smart contract interactions, Lightning payouts, and platform use. No withdrawal fees, no hidden charges, no currency conversion markups. Loyalty tiers reduce fees as you complete more projects.'
		},
		{
			question: 'Can I receive payments in stablecoins?',
			answer:
				'Yes. BitTasker supports USDC for clients who want dollar-denominated escrow. Freelancers can receive in BTC via Lightning or choose stablecoin payouts. The smart contract handles conversion logic between supported currencies.'
		},
		{
			question: "What happens if there's a payment dispute?",
			answer:
				'Disputes are handled by the Rootstock escrow smart contract. Both parties submit evidence through the platform, and the contract executes resolution based on predefined rules. Neither BitTasker nor any single party controls the outcome — the smart contract code determines the result transparently.'
		},
		{
			question: 'Is my escrow money safe?',
			answer:
				'Yes. Escrow funds are locked in a Rootstock smart contract merged-mined with Bitcoin for security. They are not held by BitTasker or any company. The contract code is auditable on the blockchain, and even if BitTasker goes offline, your funds remain accessible through the Rootstock network.'
		},
		{
			question: 'Which wallets work with BitTasker?',
			answer:
				'Any Lightning-compatible wallet works for receiving payouts — Blink, Aqua, Phoenix, Wallet of Satoshi, and others. For escrow funding, MetaMask, Ledger, Trezor, and WalletConnect are supported. BitTasker uses Nostr Wallet Connect for self-custodial wallet integration.'
		},
		{
			question: 'Can I choose which cryptocurrency to receive?',
			answer:
				'Yes. BitTasker supports BTC (via Lightning) and stablecoins. You choose your preferred currency when setting up your wallet. Clients can fund escrow in different currencies, and the smart contract handles release and conversion logic.'
		}
	],
	bitTaskerCta: {
		heading: 'Get Paid in Bitcoin — Instantly',
		body: 'BitTasker pays freelancers instantly via Lightning Network. Escrow is protected by Bitcoin-secured smart contracts. No waiting periods, no hidden fees, no bank delays.',
		buttonText: 'Sign Up Free',
		buttonHref: '/auth/signup'
	}
};
