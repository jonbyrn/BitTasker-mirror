import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Aqua Wallet: Bitcoin, Liquid & Lightning',
		subtitle: 'Self-custodial wallet for spending stablecoins and sending Bitcoin — all in one app'
	},
	answerBlock:
		'Aqua Wallet is a self-custodial Bitcoin wallet built by JAN3 that supports three networks in a single app: Bitcoin on-chain, the Liquid Network for fast confidential transactions, and Lightning for instant micro-payments. It features native Tether USDt on Liquid, making it one of the few wallets where you can hold Bitcoin and spend stablecoins without leaving the app. Available on iOS and Android with no KYC requirements, Aqua gives you full control of your keys while keeping the experience simple enough for everyday use in El Salvador, Latin America, and beyond.',
	sections: [
		{
			heading: 'What Makes Aqua Wallet Different from Other Bitcoin Wallets?',
			body: 'Most Bitcoin wallets force you to choose between on-chain functionality and Lightning speed. Aqua Wallet solves this by supporting Bitcoin, Liquid Network, and Lightning all within a single interface. You can receive BTC on-chain, swap it to Liquid for faster and cheaper transactions, or use Lightning for instant payments. The built-in Tether USDt support on Liquid means you can hold a dollar-denominated stablecoin alongside your Bitcoin — useful in regions where price volatility matters, like El Salvador and across Latin America. Aqua also lets you create multiple wallets within the same app, so you can separate your savings from your spending money without managing different apps.'
		},
		{
			heading: 'How Does Aqua Wallet Handle Stablecoins?',
			body: 'Aqua Wallet integrates native Tether USDt directly on the Liquid Network. Unlike many wallets that only support ERC-20 stablecoins on Ethereum, Aqua lets you hold and send USDt on Liquid — a Bitcoin sidechain with faster block times and lower fees than Ethereum. This is particularly valuable for freelancers, remittances, and day-to-day commerce in Latin America, where dollar stability is preferred over Bitcoin volatility for everyday expenses. You can swap between BTC and USDt within the app, hold both assets in separate wallets, and send either to anyone on the Liquid Network. The self-custodial model means no intermediary holds your stablecoins — you control the keys.'
		},
		{
			heading: 'Is Aqua Wallet Safe and Non-KYC?',
			body: 'Aqua Wallet is fully self-custodial, meaning your private keys never leave your device and no third party has access to your funds. There is no KYC (Know Your Customer) requirement — you download the app, create a wallet, and start using it immediately. This makes Aqua accessible to anyone regardless of location or documentation status. The wallet is built by JAN3, a Bitcoin technology company founded by Samson Mow, which brings institutional credibility to the project. Security features include standard seed phrase backup, PIN protection, and biometric authentication on supported devices. As with any self-custodial wallet, the trade-off is full responsibility: if you lose your seed phrase, there is no account recovery.'
		},
		{
			heading: 'How Does Aqua Wallet Compare to Blink Wallet?',
			body: 'Aqua Wallet and Blink Wallet serve different niches in the Bitcoin ecosystem. Aqua is self-custodial and supports three networks (Bitcoin, Liquid, Lightning), making it better for users who want control over their keys and access to stablecoins. Blink Wallet (formerly Bitcoin Beach Wallet) is custodial and Lightning-first, designed for simplicity and everyday payments with features like merchant POS tools and community Circles. If you prioritize self-custody and stablecoin access, choose Aqua. If you prioritize ease of use for Lightning payments and merchant adoption, Blink is a strong choice. Both wallets are popular in El Salvador and support multiple languages including Spanish.'
		},
		{
			heading: 'Can I Use Aqua Wallet for Freelance Payments?',
			body: 'Yes. Aqua Wallet is well-suited for receiving freelance payments in Bitcoin. You can receive BTC on-chain for larger payments or Lightning for smaller, faster transactions. The Liquid Network option is useful for mid-size payments where you want lower fees than on-chain Bitcoin but do not need Lightning. On BitTasker, the hirer locks Bitcoin or a Lightning payment in the wallet they open with a passkey. USDT coming soon. After the work is approved, the hirer pays their invoice. Messages open only after escrow is formed, and reviews open only after that payment. The ability to hold USDt on Liquid also means you can convert volatile Bitcoin earnings into stablecoins if you prefer dollar-denominated savings.'
		},
		{
			heading: 'Which Countries Is Aqua Wallet Available In?',
			body: 'Aqua Wallet is available globally on iOS and Android with no geographic restrictions. There is no KYC, so users in any country can download and start using it immediately. The wallet has particular relevance in El Salvador and Latin America, where JAN3 has been actively promoting Bitcoin adoption. Users in the United States, Europe, and Asia also use Aqua for its multi-network functionality. The app supports English and Spanish as primary languages, making it accessible across Latin America. Since Aqua is non-custodial, there are no regional banking integrations — transactions happen directly on Bitcoin, Liquid, and Lightning networks.'
		}
	],
	faq: [
		{
			question: 'Is Aqua Wallet free to use?',
			answer:
				'Aqua Wallet is free to download and use. There are no subscription fees. Standard network fees apply when you send Bitcoin, Liquid transactions, or Lightning payments — these are paid to the respective networks, not to Aqua.'
		},
		{
			question: 'Can I buy Bitcoin directly in Aqua Wallet?',
			answer:
				'Aqua Wallet supports buying Bitcoin through integrated third-party services. You can also receive Bitcoin from other wallets, exchanges, or payment platforms. The availability of in-app purchase options may vary by region.'
		},
		{
			question: 'Does Aqua Wallet support Lightning Network?',
			answer:
				'Yes, Aqua Wallet supports Lightning Network payments alongside on-chain Bitcoin and Liquid Network. You can send and receive Lightning payments for instant, low-fee transactions.'
		},
		{
			question: 'What is Tether USDt on Liquid Network?',
			answer:
				'Tether USDt on Liquid is a dollar-pegged stablecoin running on the Liquid Network, a Bitcoin sidechain. It offers faster transactions and lower fees than USDt on Ethereum, making it practical for everyday spending in regions like Latin America.'
		},
		{
			question: 'How many wallets can I create in Aqua?',
			answer:
				'Aqua Wallet allows you to create multiple wallets within a single app. This lets you separate your savings from your spending money, organize funds by purpose, or manage different assets independently.'
		},
		{
			question: 'Who built Aqua Wallet?',
			answer:
				'Aqua Wallet is built by JAN3, a Bitcoin technology company founded by Samson Mow. JAN3 focuses on advancing Bitcoin adoption globally, with particular emphasis on Latin America and emerging markets.'
		},
		{
			question: 'Is Aqua Wallet better than hardware wallets?',
			answer:
				'Aqua Wallet and hardware wallets serve different purposes. Hardware wallets like Coldcard and Ledger are designed for long-term cold storage of large Bitcoin holdings. Aqua is a mobile wallet optimized for daily transactions, spending, and multi-network access. Many Bitcoiners use both: a hardware wallet for savings and Aqua for spending.'
		}
	],
	bitTaskerCta: {
		heading: 'Get Paid in Bitcoin to Your Aqua Wallet',
		body: 'Connect your Aqua Wallet to BitTasker and receive freelance payments in BTC, Lightning, or stablecoins — directly to your self-custodial wallet.',
		buttonText: 'Start Earning on BitTasker',
		buttonHref: '/auth/signup'
	}
};
