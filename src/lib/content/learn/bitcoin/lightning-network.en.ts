import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: "Lightning Network Explained: Bitcoin's Payment Layer",
		subtitle:
			"How Bitcoin's Layer 2 enables instant, near-zero-fee payments for freelancers and everyday use."
	},
	answerBlock:
		"The Lightning Network is a Layer 2 payment protocol built on top of Bitcoin that enables instant, near-zero-fee transactions. Instead of settling every payment on Bitcoin's main chain — which takes 10+ minutes and costs variable fees — Lightning creates off-chain payment channels between participants. Payments route through a network of these channels, arriving in milliseconds for fractions of a cent. For freelancers, this means you can receive payment the moment work is approved, without waiting for blockchain confirmations or paying fees that eat into small transactions. Lightning has proven its viability at national scale in El Salvador and is now the standard for Bitcoin micropayments worldwide.",
	sections: [
		{
			heading: 'What is the Lightning Network?',
			body: "The Lightning Network is a decentralized payment protocol that operates as a second layer on top of Bitcoin's base blockchain. Created by Joseph Poon and Thaddeus Dryja in 2015 and launched in 2018, it solves Bitcoin's scalability limitations by allowing two parties to open a payment channel, transact between themselves an unlimited number of times instantly and for minimal cost, and then settle the final balance on Bitcoin's main chain. Think of it like opening a bar tab: you open a channel (start a tab), make as many transactions as you want (order drinks), and only settle once at the end (close the tab and pay the final amount). The key insight is that most transactions don't need to be recorded individually on the blockchain — only the opening and closing balances matter."
		},
		{
			heading: 'How does Lightning enable instant payments?',
			body: "Traditional Bitcoin transactions require block confirmation — miners must include your transaction in a block, which happens roughly every 10 minutes. For high-value transactions, waiting for 3-6 confirmations (30-60 minutes) is standard practice. Lightning bypasses this entirely. When two parties have an open payment channel, they can exchange signed transactions between themselves without broadcasting anything to the blockchain. These off-chain transactions are instant because they're simply exchanges of cryptographic commitments between two wallets — no miners, no waiting, no block space competition. When the channel closes, only the net balance is settled on-chain. This architecture enables sub-second payment finality with fees typically under $0.01, regardless of the transaction amount."
		},
		{
			heading: 'How do Lightning channels and routing work?',
			body: "A Lightning channel is a two-of-two multisig Bitcoin address funded by two parties. Once opened, either party can update the channel's balance distribution by exchanging signed transactions. The critical innovation is routing: if Alice has a channel with Bob, and Bob has a channel with Charlie, Alice can pay Charlie through Bob without Alice and Charlie having a direct channel. Bob acts as a routing node, forwarding the payment and earning a small fee for the service. This creates a network effect — as more channels open, payment paths multiply. Routing nodes are selected based on their capacity (how much Bitcoin they hold in channels) and reliability. The network currently has thousands of routing nodes with combined capacity in the hundreds of millions of dollars."
		},
		{
			heading: 'What are Lightning wallets and which should you use?',
			body: 'Lightning wallets come in several forms. Non-custodial mobile wallets like Wallet of Satoshi, Phoenix, and Blink give you full control of your keys while handling channel management automatically. Custodial wallets like Strike or the BitTasker built-in wallet offer convenience at the cost of trusting a third party with your funds. Hardware wallets like Coldcard and Foundation Passport can connect to Lightning through companion apps for maximum security. For freelancers receiving payments, non-custodial wallets like Phoenix or Blink offer the best balance of security and usability — you own your funds, channels are managed automatically, and payments arrive instantly. The choice between wallets depends on your technical comfort level and how much you prioritize self-custody versus convenience.'
		},
		{
			heading: 'How did El Salvador adopt the Lightning Network?',
			body: "El Salvador became the first country to adopt Bitcoin as legal tender in September 2021, with the Lightning Network as its primary payment rail. Bitcoin Beach, a grassroots initiative in the coastal town of El Zonte, pioneered Lightning payments in a real community before the national rollout. The government's Chivo wallet processed millions in Lightning transactions within its first year. While Chivo was eventually discontinued, the Lightning ecosystem in El Salvador continued to grow through merchant adoption and tourism. Today, thousands of businesses across El Salvador accept Lightning payments, from street vendors to major retailers. This real-world stress test proved Lightning can handle national-scale commerce — processing thousands of transactions per second at negligible cost."
		},
		{
			heading: 'What are the limitations and risks of the Lightning Network?',
			body: "Lightning is not without challenges. Channel capacity limits how much you can receive in a single payment — if a channel has 0.01 BTC capacity, you can't receive more than that without additional inbound capacity. Liquidity management requires some understanding of how channels work, though modern wallets automate much of this. Routing failures can occur when paths between sender and receiver are insufficient, though the network has improved significantly in reliability. There's also the risk of having to monitor your channels on-chain to prevent a counterparty from broadcasting an old state (fraud attempt). Most modern wallets handle this monitoring automatically. Finally, Lightning is designed for smaller, frequent payments — for very large transactions, on-chain settlement remains more practical."
		},
		{
			heading: 'How does BitTasker use Lightning for instant task payments?',
			body: "BitTasker integrates Lightning Network as the default payment method for freelance task payouts. When a client approves completed work, the payment is routed through Lightning and arrives in the freelancer's wallet within seconds — not hours or days. There are no minimum payout thresholds, no waiting periods, and no batch processing delays. This means a freelancer in Latin America can complete a task at 2 PM and have spendable Bitcoin in their wallet by 2:01 PM, ready to pay for goods and services locally. Lightning also eliminates the high fees that make micro-payments impractical on traditional payment rails, making it economically viable to pay for small tasks without fees consuming a significant percentage of the payment."
		}
	],
	faq: [
		{
			question: 'Is the Lightning Network safe for receiving payments?',
			answer:
				"Yes. Lightning payments are secured by Bitcoin's cryptographic guarantees. When you receive a payment, you get a signed transaction that you can broadcast on-chain to claim your funds. Modern wallets handle security automatically, including monitoring for fraudulent channel closures. The main risk is operational — losing access to your wallet could lock funds in channels — which is why regular backups are essential."
		},
		{
			question: 'How much are Lightning Network fees?',
			answer:
				'Lightning fees are typically under $0.01 per transaction, regardless of the payment amount. The fee is split between routing nodes that forward your payment. Some Lightning service providers charge small fees for channel management or liquidity, but these are usually minimal. For freelancers, this means keeping nearly 100% of your earnings compared to the 5-20% fees charged by traditional platforms.'
		},
		{
			question: 'Can I receive large payments on Lightning?',
			answer:
				'Lightning can handle payments of any size, but your channel capacity determines the maximum you can receive at once. If you need to receive a payment larger than your channel capacity, you may need to open additional channels or wait for existing channels to have available capacity. For most freelance work, typical channel capacities (0.001-0.1 BTC) are more than sufficient.'
		},
		{
			question: 'Do I need to be online to receive Lightning payments?',
			answer:
				'Not necessarily. Modern Lightning wallets use watchtowers — third-party services that monitor your channels on-chain and can act on your behalf if a counterparty tries to cheat. Many wallets include built-in watchtower support. However, being offline for extended periods (weeks or months) is not recommended, as you may miss channel management opportunities.'
		},
		{
			question: 'How is Lightning different from a regular Bitcoin transaction?',
			answer:
				'Regular Bitcoin transactions are settled on-chain, taking 10+ minutes for confirmation and costing fees based on network congestion. Lightning transactions happen off-chain, settling instantly at near-zero cost. Lightning is ideal for frequent, smaller payments; on-chain is better for large, infrequent settlements. Both use Bitcoin — Lightning is just a faster, cheaper layer on top.'
		},
		{
			question: 'Can I convert Lightning payments to my local currency?',
			answer:
				'Yes. You can use exchanges, peer-to-peer platforms, or Lightning-enabled services to convert BTC to your local currency. In El Salvador, many merchants accept Lightning BTC directly, reducing the need for conversion. Services like Strike allow instant conversion to USD in supported countries.'
		}
	],
	bitTaskerCta: {
		heading: 'Get paid instantly with Lightning on BitTasker',
		body: 'BitTasker routes all freelance payouts through the Lightning Network, so your earnings arrive in seconds with minimal fees. No waiting periods, no batch processing — just instant Bitcoin in your wallet.',
		buttonText: 'Start Earning on BitTasker',
		buttonHref: '/auth/signup'
	}
};
