import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Lightning Wallet: Instant Bitcoin Payments',
		subtitle: "Everything you need to know about Bitcoin's fastest payment layer"
	},
	answerBlock:
		"A Lightning wallet is a type of Bitcoin wallet built on the Lightning Network, a Layer 2 solution that enables instant, low-fee Bitcoin transactions. Unlike on-chain Bitcoin payments that take 10-60 minutes to confirm, Lightning payments settle in seconds for fractions of a cent. This makes Lightning ideal for everyday purchases, tipping, remittances, and freelance payments. In El Salvador, Lightning adoption has been a cornerstone of the country's Bitcoin strategy, powering merchant payments nationwide. Whether you choose a custodial wallet like Blink for simplicity or a self-custodial wallet like Aqua for key control, Lightning is the fastest way to use Bitcoin for daily transactions.",
	sections: [
		{
			heading: 'What Is Lightning Network and Why Does Bitcoin Need It?',
			body: "The Lightning Network is a Layer 2 payment protocol built on top of Bitcoin. It was created to solve Bitcoin's scalability limitations — on-chain transactions are limited to about 7 per second and take 10-60 minutes to confirm. Lightning creates payment channels between users, allowing thousands of off-chain transactions that settle instantly on the Bitcoin blockchain when the channel closes. Think of it like a tab at a bar: instead of paying cash after every drink, you open a tab and settle once at the end. For Bitcoin, this means you can send satoshis instantly with negligible fees, making micro-transactions and everyday payments practical for the first time."
		},
		{
			heading: 'What Is the Difference Between Custodial and Non-Custodial Lightning Wallets?',
			body: 'Custodial Lightning wallets (like Blink Wallet) hold your Bitcoin on your behalf — you trust the service to manage Lightning channels and keep your funds safe. The trade-off is simplicity: no channel management, no channel capacity concerns, and instant setup. Non-custodial Lightning wallets (like Aqua Wallet or Zeus) give you full control of your keys and Lightning channels. You manage your own channel capacity and node connections. The trade-off is complexity: you need to maintain channel liquidity and understand basic Lightning concepts. For beginners, custodial is simpler. For sovereignty-minded users, non-custodial is the way. Both options are widely available and free to download.'
		},
		{
			heading: 'What are the best Lightning wallets in 2026?',
			body: 'Aqua Wallet is the best self-custodial option, supporting Lightning alongside on-chain Bitcoin and Liquid Network — three networks in one free app. Blink Wallet (formerly Bitcoin Beach Wallet) is the best custodial option with its dollar-denominated balance, merchant POS tools, and multilingual support across six languages. Wallet of Satoshi is a popular custodial Lightning wallet with a clean interface. Muun is a hybrid wallet that supports both on-chain and Lightning with a single key set. For most users in El Salvador and Latin America, Aqua or Blink covers daily Lightning needs. Choose Aqua for self-custody; choose Blink for simplicity and merchant features.'
		},
		{
			heading: 'How Does El Salvador Use Lightning Network?',
			body: "El Salvador became the first country to adopt Bitcoin as legal tender in September 2021, and Lightning Network is the backbone of that adoption. The Chivo Wallet (now deprecated) was the government's Lightning wallet, but the ecosystem has evolved to include Blink, Aqua, and dozens of other Lightning-compatible wallets. Merchants across El Salvador accept Lightning payments via QR codes — from street vendors to major retailers. The Lightning Network's instant settlement and near-zero fees make it ideal for a country where many citizens are unbanked and remittances represent a significant portion of GDP. Lightning adoption in El Salvador demonstrates that Bitcoin can function as a practical daily payment system, not just a store of value."
		},
		{
			heading: 'How does BitTasker use Lightning for freelance payments?',
			body: "BitTasker integrates Lightning Network to enable instant freelancer payouts. When a client approves your work, payment is sent over Lightning and arrives in your wallet within seconds — no waiting for bank transfers or on-chain confirmations. This is particularly valuable for freelancers in developing countries where traditional payment rails are slow and expensive. Lightning payments on BitTasker have negligible fees, meaning freelancers keep more of their earnings. You can receive Lightning payments in any compatible wallet, including Blink, Aqua, Wallet of Satoshi, or any other Lightning-enabled wallet. The combination of BitTasker's escrow protection and Lightning's instant settlement creates a payment system that is faster, cheaper, and more accessible than traditional freelance platforms."
		},
		{
			heading: 'How do you set up a Lightning wallet?',
			body: 'Setting up a Lightning wallet takes about two minutes. Download Aqua Wallet or Blink Wallet from the App Store or Google Play. Follow the on-screen prompts to create a new wallet — you will receive a Lightning address (similar to an email address) that you can share to receive payments. No ID verification is required for basic use. To fund your wallet, you can buy Bitcoin through integrated services, receive Lightning payments from another wallet, or transfer Bitcoin from an exchange. Once funded, you can send Lightning payments by scanning QR codes or entering a Lightning invoice. For most users, the default settings work fine — advanced features like channel management are optional and only needed for self-custodial wallets.'
		}
	],
	faq: [
		{
			question: 'How fast are Lightning payments?',
			answer:
				'Lightning payments settle in 1-3 seconds. Compare this to on-chain Bitcoin payments which take 10-60 minutes for confirmation. Lightning is the fastest way to send and receive Bitcoin.'
		},
		{
			question: 'What are Lightning Network fees?',
			answer:
				'Lightning fees are typically fractions of a cent per transaction — usually between $0.0001 and $0.01 depending on the payment path. This makes Lightning ideal for micro-transactions and everyday spending.'
		},
		{
			question: 'Is Lightning Network safe?',
			answer:
				"Lightning Network is built on Bitcoin's security model. Transactions are secured by cryptographic proofs and the Bitcoin blockchain. However, custodial Lightning wallets carry custodial risk — you trust the service with your funds. Non-custodial wallets give you full control."
		},
		{
			question: 'Can I use Lightning on any Bitcoin wallet?',
			answer:
				'No, not all Bitcoin wallets support Lightning. You need a wallet specifically designed for Lightning payments. Popular options include Aqua Wallet, Blink Wallet, Wallet of Satoshi, and Muun. Always check Lightning support before choosing a wallet.'
		},
		{
			question: 'What is a Lightning address?',
			answer:
				'A Lightning address is a human-readable identifier for receiving Lightning payments, similar to an email address. For example: username@wallet.com. It simplifies the payment process by replacing complex Lightning invoices with an easy-to-share address.'
		},
		{
			question: 'Can I receive Lightning payments from anyone?',
			answer:
				'Yes, anyone with a Lightning-compatible wallet can send you a payment using your Lightning address or by scanning your QR code. Lightning is interoperable across wallets — you do not need to use the same wallet as the sender.'
		},
		{
			question: 'How does Lightning compare to on-chain Bitcoin for payments?',
			answer:
				'Lightning is faster (seconds vs minutes), cheaper (fractions of a cent vs $1-5+ in fees), and supports micro-transactions (as small as a few satoshis). On-chain Bitcoin is better for large, infrequent transactions where maximum security is needed. Lightning is better for daily spending and payments.'
		}
	],
	bitTaskerCta: {
		heading: 'Get Paid Instantly Over Lightning',
		body: 'BitTasker uses Lightning Network to pay freelancers the moment work is approved. No bank delays, no high fees — just Bitcoin in your wallet in seconds.',
		buttonText: 'Start Earning Bitcoin',
		buttonHref: '/auth/signup'
	}
};
