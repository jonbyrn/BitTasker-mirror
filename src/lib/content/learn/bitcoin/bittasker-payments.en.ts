import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Payments: How Freelancers Get Paid',
		subtitle:
			'Bitcoin, Lightning, RBTC, and stablecoins — instant payouts with trustless escrow protection.'
	},
	answerBlock:
		"BitTasker supports multiple payment methods designed for the global freelance economy: Bitcoin for secure value storage, Lightning Network for instant low-fee payouts, Rootstock (RBTC) for smart contract escrow, and stablecoins for dollar-denominated payments. When a client approves completed work, funds are released from a Rootstock escrow smart contract and routed to the freelancer's wallet via Lightning — arriving in seconds. There are no batch processing delays, no waiting periods, and no minimum payout thresholds. BitTasker's tiered fee structure rewards loyalty with lower rates, and every transaction is protected by auditable smart contracts on Bitcoin's security model.",
	sections: [
		{
			heading: 'How do payments work on BitTasker?',
			body: "BitTasker's payment flow is designed for transparency and speed. When a client posts a task, they fund an escrow smart contract on Rootstock with the agreed amount — in BTC, RBTC, USDC, or another supported asset. The smart contract locks the funds and specifies the release conditions: typically, milestone approval from the client. When the freelancer completes the work and the client approves, the smart contract automatically releases payment. The freelancer receives funds via Lightning Network, arriving in their wallet within seconds. If there's a dispute, the smart contract follows predefined resolution rules. At no point does BitTasker hold or control the escrow funds — they exist in auditable code on the Rootstock blockchain."
		},
		{
			heading: 'What payment methods does BitTasker support?',
			body: "BitTasker accepts and pays out in multiple cryptocurrencies. Bitcoin (BTC) is the primary asset — clients can fund escrow in BTC, and freelancers can receive payments in BTC. Lightning Network handles instant, low-fee transfers for payouts. Rootstock Bitcoin (RBTC) is used for smart contract interactions on the Rootstock sidechain. Stablecoins (USDC, and potentially others) are supported for clients who want dollar-denominated escrow — useful for budget predictability. The multi-asset approach means clients and freelancers aren't locked into a single currency. A client in the US can fund escrow in USDC, while a freelancer in El Salvador receives payment in BTC via Lightning — the smart contract handles the conversion logic."
		},
		{
			heading: 'How does Rootstock smart contract escrow protect your payments?',
			body: "Every project on BitTasker is protected by Rootstock smart contracts. When a client funds a project, the payment goes into a smart contract — not BitTasker's bank account. The contract enforces the agreed terms: payment is held until milestones are approved, and disputes follow transparent resolution rules. Rootstock is merged-mined with Bitcoin, meaning these escrow contracts benefit from the same hash rate that secures Bitcoin itself. The key advantage over traditional platform escrow: no single entity can freeze, redirect, or manipulate the funds. Even if BitTasker went offline, the escrow contracts would remain functional and accessible on the Rootstock blockchain. Clients get proof that their funds are secure; freelancers get proof that payment will arrive when they deliver."
		},
		{
			heading: 'Can you buy, sell, and swap cryptocurrencies on BitTasker?',
			body: 'BitTasker includes built-in exchange features so freelancers can convert between cryptocurrencies without leaving the platform. Need to convert BTC earnings to USDC for a local purchase? Use the swap feature. Want to sell BTC for your local currency? The integrated exchange connects to liquidity providers for competitive rates. This eliminates the friction of moving funds to external exchanges, converting, and transferring back — a process that can take hours and incur multiple fees. For freelancers in Latin America, where exchange access may be limited, having swap functionality integrated into the payment platform is particularly valuable.'
		},
		{
			heading: "How does BitTasker's tiered fee structure work?",
			body: "BitTasker's fee structure is designed to reward consistent platform use. Service fees range from 5-10% depending on the project type and your loyalty tier — freelancers who complete more projects on BitTasker unlock lower fee rates. There are no hidden charges: the service fee covers escrow management, smart contract interactions, Lightning payout routing, and platform use. Rootstock network fees for smart contract interactions are minimal (under $0.01). Lightning transaction fees are similarly negligible. Compared to traditional platforms that charge 10-20% and deduct additional withdrawal fees, BitTasker's transparent, tiered structure means freelancers keep more of their earnings. The loyalty model creates a positive incentive loop: the more you work on BitTasker, the less you pay in fees."
		},
		{
			heading: 'How fast are BitTasker payouts via Lightning?',
			body: 'Traditional freelance platforms pay out weekly or monthly, often with 3-5 day delays for bank transfers. BitTasker pays out instantly via Lightning Network. When a client approves work, the payment routes through Lightning and arrives in the freelancer\'s wallet in seconds — regardless of their country, bank, or time zone. There\'s no minimum payout amount, no batch processing schedule, and no withdrawal delays. For freelancers who depend on timely payments to manage cash flow, this is transformative. A freelancer in Argentina can complete work at 3 PM and have spendable Bitcoin in their wallet by 3:01 PM, ready to pay for services locally via Lightning merchants. The instant settlement eliminates the "payment anxiety" that plagues traditional freelance relationships.'
		},
		{
			heading: 'Why are BitTasker payments different from traditional platforms?',
			body: "Traditional freelance platforms (Upwork, Fiverr, Freelancer.com) operate on centralized payment systems: they hold your funds in their bank accounts, process payouts on fixed schedules, and charge fees for withdrawals, currency conversion, and expedited payments. BitTasker's approach is fundamentally different. Escrow exists on-chain in smart contracts, not in corporate bank accounts. Payouts route through Lightning, not bank wire networks. Fees are transparent and tiered, not layered with hidden charges. And because payments are crypto-native, there are no currency conversion markups — you receive exactly what was agreed. The result is a payment system that's faster, cheaper, and more transparent than anything traditional platforms offer."
		}
	],
	faq: [
		{
			question: 'How fast do I get paid on BitTasker?',
			answer:
				'Instantly. When a client approves your completed work, the payment is routed through Lightning Network and arrives in your wallet within seconds. There are no waiting periods, batch processing, or bank transfer delays. Your earnings are available immediately.'
		},
		{
			question: "What are BitTasker's fees?",
			answer:
				'BitTasker charges a service fee of 5-10% depending on project type and your loyalty tier. This covers escrow management, smart contract interactions, Lightning payouts, and platform use. There are no withdrawal fees, no hidden charges, and no currency conversion markups. Loyalty tiers reduce your fee rate as you complete more projects.'
		},
		{
			question: 'Can I receive payments in my local currency?',
			answer:
				'BitTasker pays out in cryptocurrency (BTC, Lightning, or stablecoins). You can convert to your local currency through integrated swap features or external exchanges. In regions with Lightning merchant adoption (like El Salvador), you can spend BTC directly without conversion.'
		},
		{
			question: "What happens if there's a payment dispute?",
			answer:
				'Disputes are handled by the Rootstock escrow smart contract. Both parties submit evidence through the platform, and the contract executes the resolution based on predefined rules. Neither BitTasker nor any single party controls the outcome — the smart contract code determines the result transparently.'
		},
		{
			question: 'Is my escrow money safe?',
			answer:
				"Yes. Escrow funds are locked in a Rootstock smart contract — merged-mined with Bitcoin for security. They're not held by BitTasker or any company. The contract code is auditable on the blockchain, and you can verify the escrow conditions before agreeing to them. Even if BitTasker goes offline, your funds remain accessible through the Rootstock network."
		},
		{
			question: 'Can I choose which cryptocurrency to receive?',
			answer:
				'Yes. BitTasker supports multiple payout currencies including BTC (via Lightning) and stablecoins (like USDC). You choose your preferred currency when setting up your wallet. Clients can fund escrow in different currencies, and the smart contract handles the logic for release and conversion.'
		}
	],
	bitTaskerCta: {
		heading: 'Start earning with instant Bitcoin payments',
		body: 'BitTasker pays freelancers instantly via Lightning Network. Escrow is protected by Bitcoin-secured smart contracts. No waiting periods, no hidden fees, no bank delays.',
		buttonText: 'Join BitTasker Now',
		buttonHref: '/auth/signup'
	}
};
