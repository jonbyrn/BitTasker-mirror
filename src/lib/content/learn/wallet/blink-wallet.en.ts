import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Blink Wallet: Lightning Bitcoin for Everyone',
		subtitle: 'The easiest way to send, receive, and spend Bitcoin over Lightning Network'
	},
	answerBlock:
		'Blink Wallet (formerly Bitcoin Beach Wallet) is a Lightning-first Bitcoin wallet born in El Zonte, El Salvador in 2020. Built by Galoy, a team based in Latin America, Blink makes Bitcoin payments as simple as sending a text message. It features a dollar-denominated balance so you see your purchasing power without Bitcoin price volatility, supports multiple languages (English, Spanish, French, German, Turkish, and Brazilian Portuguese), and offers merchant tools including POS systems, community Circles, and Bitcoin vouchers. Blink uses a custodial model for maximum simplicity, making it the ideal on-ramp for anyone new to Bitcoin payments in El Salvador and across Latin America.',
	sections: [
		{
			heading: 'What Is Blink Wallet and Where Did It Come From?',
			body: 'Blink Wallet originated as the Bitcoin Beach Wallet in El Zonte, a small coastal town in El Salvador that became famous as one of the first Bitcoin circular economies. When El Salvador adopted Bitcoin as legal tender in September 2021, the wallet was rebranded as Blink. It is built on the Galoy open-source framework, maintained by a team based in Latin America. The wallet was designed from day one for real-world merchant adoption — not as a speculative trading tool. Today, Blink serves users across multiple countries and supports six languages, making it one of the most accessible Bitcoin Lightning wallets available.'
		},
		{
			heading: 'How Does the Dollar Balance Work in Blink?',
			body: 'Blink displays your Bitcoin balance in US dollar equivalents, so you always know what your purchasing power is without worrying about BTC price swings. When you receive sats (satoshis), Blink converts them to a dollar value in real-time. You can send and receive in either denomination — sats or dollars — depending on your preference. This is especially useful in El Salvador and Latin America, where the dollar is the reference currency for everyday pricing. The underlying asset is always Bitcoin on the Lightning Network; the dollar display is simply a convenience layer that makes the experience more familiar for users accustomed to fiat pricing.'
		},
		{
			heading: 'What Are Blink Circles and Merchant Tools?',
			body: 'Blink offers several features beyond simple peer-to-peer payments. Circles allow communities to create their own internal economies — groups of people who regularly transact with each other using Bitcoin on Lightning. For merchants, Blink provides point-of-sale (POS) tools that generate QR codes for customers to scan and pay instantly. Bitcoin vouchers let you create pre-loaded Bitcoin cards that can be distributed as gifts or used for local commerce. These features make Blink more than a wallet — it is a local economic infrastructure layer. The open-source Galoy framework also provides APIs for developers, with plugins for BTCPay Server and WooCommerce, enabling any business to integrate Bitcoin Lightning payments.'
		},
		{
			heading: 'Is Blink Wallet Custodial or Non-Custodial?',
			body: 'Blink Wallet uses a custodial model, meaning your Bitcoin on Lightning is held by the Blink infrastructure rather than in a self-custodial wallet where you control the private keys. This trade-off enables simpler UX, instant transactions, and lower barriers for new users — you do not need to manage seed phrases or worry about channel capacity. For beginners in El Salvador and Latin America, this custodial approach removes friction and makes Bitcoin payments practical. However, experienced users who prefer full self-custody may want to combine Blink with a self-custodial wallet like Aqua or a hardware wallet for savings, using Blink primarily for spending and daily transactions.'
		},
		{
			heading: 'What Languages Does Blink Wallet Support?',
			body: "Blink Wallet is available in six languages: English, Spanish, French, German, Turkish, and Brazilian Portuguese. This multilingual support reflects the wallet's focus on global Bitcoin adoption beyond English-speaking markets. Spanish support is particularly robust, given the wallet's origins in El Salvador and its strong presence across Latin America. The interface, support documentation, and in-app messaging are all localized, making Blink accessible to users who prefer to interact in their native language."
		},
		{
			heading: 'How Does Blink Compare to Aqua Wallet for Daily Spending?',
			body: "Blink and Aqua both serve the Latin American market but take different approaches. Blink is custodial and Lightning-first, optimized for simplicity and merchant payments — ideal for everyday spending where ease of use matters most. Aqua is self-custodial and multi-network (Bitcoin, Liquid, Lightning), better for users who want key control and stablecoin access. Blink's dollar balance and POS tools make it superior for merchant adoption. Aqua's Liquid USDt support makes it better for holding stablecoins. Many users in El Salvador keep both: Blink for spending and merchant payments, Aqua for savings and stablecoin holdings. Both are free to download."
		},
		{
			heading: 'Can Developers Build on Blink Wallet?',
			body: 'Yes. Blink is built on the Galoy open-source framework, which provides APIs for developers to integrate Bitcoin Lightning payments into their own applications. There are existing plugins for BTCPay Server and WooCommerce, allowing online stores to accept Lightning payments through Blink infrastructure. The Galoy framework also supports custom deployments, enabling communities and businesses to run their own Blink instances. This open-source approach has made Blink one of the most developer-friendly Bitcoin payment platforms, with active community contributions and documentation.'
		}
	],
	faq: [
		{
			question: 'Is Blink Wallet free to use?',
			answer:
				'Blink Wallet is free to download and use. Lightning Network fees are minimal — typically fractions of a cent per transaction. There are no subscription fees or account maintenance charges.'
		},
		{
			question: 'Can I buy Bitcoin in Blink Wallet?',
			answer:
				'Yes, Blink supports buying Bitcoin through integrated services. You can also receive Lightning payments from other wallets, exchanges, or payment platforms. In-app purchase availability may vary by country.'
		},
		{
			question: 'What is the minimum amount I can send on Lightning via Blink?',
			answer:
				'Lightning Network supports micro-transactions — you can send as little as a few satoshis (fractions of a cent) through Blink. This makes it ideal for tipping, small purchases, and micro-payments.'
		},
		{
			question: 'Is Blink Wallet available outside El Salvador?',
			answer:
				'Yes, Blink Wallet is available globally. While it originated in El Salvador and has strong adoption there, users in any country can download and use Blink. The multi-language support (EN, ES, FR, DE, TR, BR) reflects its global reach.'
		},
		{
			question: 'Is my Bitcoin safe in Blink Wallet?',
			answer:
				'Blink is a custodial wallet, meaning Bitcoin is held by the Blink/Galoy infrastructure rather than in your personal self-custodial wallet. For everyday spending amounts, this is convenient and practical. For larger savings, consider transferring to a self-custodial wallet like Aqua or a hardware wallet.'
		},
		{
			question: 'Does Blink work with BitTasker?',
			answer:
				'Blink Wallet supports Lightning payments, which BitTasker uses for instant freelance payouts. You can receive earnings from BitTasker directly to your Blink Wallet over the Lightning Network.'
		}
	],
	bitTaskerCta: {
		heading: 'Receive Freelance Payments in Lightning',
		body: 'BitTasker pays freelancers instantly over the Lightning Network. Connect your Blink Wallet and get paid in Bitcoin the moment your work is approved.',
		buttonText: 'Join BitTasker Today',
		buttonHref: '/auth/signup'
	}
};
