import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: "Get Paid in Bitcoin: A Freelancer's Complete Guide",
		subtitle:
			'Learn how freelancers earn $500–$1,500/month in Bitcoin with Lightning payments, wallet setup, and tax tips.'
	},
	answerBlock:
		'Freelancers can receive Bitcoin payments instantly through the Lightning Network for work on platforms like BitTasker, LaborX, and other crypto-native marketplaces. Getting started requires setting up a Lightning-compatible wallet (such as Aqua, Blink, or Wallet of Satoshi), completing freelance work, and receiving satoshis directly to your wallet. You can hold Bitcoin as savings, convert to local currency through exchanges, or spend it directly at merchants accepting BTC. Earnings typically range from $500 to $1,500/month for part-time freelancers doing development, design, writing, or translation work.',
	sections: [
		{
			heading: 'How do freelancers receive Bitcoin payments?',
			body: 'Bitcoin freelancing platforms like BitTasker pay through the Lightning Network — a Layer 2 solution built on top of Bitcoin that enables instant, low-fee transactions. When you complete a project and the client approves delivery, satoshis are sent directly to your Lightning wallet. The process works like receiving any digital payment: you generate an invoice (or provide your Lightning address), the client pays, and the funds arrive in seconds. There is no bank intermediary, no 3–5 day processing delay, and transaction fees are typically under a cent.'
		},
		{
			heading: 'What Lightning wallet should freelancers use?',
			body: 'For freelancers receiving regular Bitcoin payments, a mobile Lightning wallet is the practical starting point. Aqua Wallet offers a clean interface with both Lightning and on-chain Bitcoin support, making it ideal for Latin American freelancers who also need dollar-denominated options. Blink Wallet is popular in El Salvador and Latin America with strong Spanish-language support. Wallet of Satoshi is the simplest option for beginners — it works like a custodial Lightning wallet with no setup complexity. For larger amounts or long-term savings, move Bitcoin from your Lightning wallet to a hardware wallet like Coldcard or Trezor.'
		},
		{
			heading: 'How do I convert Bitcoin to my local currency?',
			body: 'Several on-ramp services let you convert Bitcoin to your local currency. In Latin America, platforms like Relai (available in Mexico and other LATAM countries) and Strike allow you to sell Bitcoin and receive pesos directly to your bank account. In El Salvador, Chivo Wallet and IBEX Pay provide seamless BTC-to-dollar conversion. For other regions, peer-to-peer exchanges like Bisq or Hodl Hodl let you sell Bitcoin for local bank transfers. Some freelancers keep a portion of earnings in Bitcoin as savings and convert only what they need for monthly expenses.'
		},
		{
			heading: 'What are the tax implications of earning Bitcoin?',
			body: 'In most jurisdictions, receiving Bitcoin as payment for services is treated as ordinary income, valued at the fair market price at the time of receipt. If you later sell that Bitcoin at a higher price, you may owe capital gains tax on the difference. Tax rules vary significantly by country — El Salvador has made Bitcoin legal tender with specific tax provisions, while the US, EU, and other countries have their own frameworks. This article provides general information, not tax advice. Consult a qualified tax professional in your jurisdiction for guidance specific to your situation.'
		},
		{
			heading: 'How much can freelancers earn in Bitcoin?',
			body: 'Earnings vary widely by skill, experience, and hours worked. Part-time freelancers typically earn $500–$1,500/month. Full-time freelancers in high-demand fields like software development can earn $3,000–$8,000/month or more. The Bitcoin-native economy pays competitive rates because employers save on traditional banking fees, international wire transfers, and platform commissions. Developers and designers with Lightning or Nostr experience command premium rates of $75–$150/hour on crypto-native platforms.'
		},
		{
			heading: 'What types of work pay in Bitcoin?',
			body: 'The most common Bitcoin-paying freelance categories include: software development (web, mobile, smart contracts), UI/UX design, content writing and copywriting, translation services, digital marketing, video editing, and virtual assistance. BitTasker also features local tasks — physical services like delivery, cleaning, or handyman work that can be paid in Bitcoin. As Bitcoin adoption grows, more traditional service categories are becoming available on crypto-native platforms.'
		},
		{
			heading: 'Which platforms pay freelancers in Bitcoin?',
			body: 'The Bitcoin freelancing ecosystem includes several platforms serving different niches. On BitTasker, the hirer locks Bitcoin, USDT on RGB, or a Lightning payment in the wallet they open with a passkey. After the work is approved, the hirer pays their invoice. Messages open only after escrow is formed, and reviews open only after that payment. LaborX offers a broad marketplace for Bitcoin-paying jobs across development, design, and creative work. CryptoJobsList aggregates remote crypto job listings. AngelList hosts startup roles that sometimes pay in Bitcoin. Bitwage lets you receive any salary in Bitcoin, even from traditional employers. For the best combination of low fees, fast payments, and decentralized identity, BitTasker is purpose-built for Bitcoin freelancing.'
		}
	],
	faq: [
		{
			question: 'Is it safe to receive Bitcoin as payment for freelance work?',
			answer:
				"Yes, receiving Bitcoin through established platforms and Lightning wallets is safe. Use reputable wallets, keep your recovery seed phrase secure, and start with smaller amounts until you're comfortable with the process. Lightning Network transactions are final and irreversible once confirmed."
		},
		{
			question: 'Do I need to declare Bitcoin earnings on my taxes?',
			answer:
				'In most countries, yes. Bitcoin received as payment is typically treated as taxable income at its market value when received. Consult a tax professional for your specific jurisdiction. El Salvador has special provisions since Bitcoin is legal tender there.'
		},
		{
			question: "What if Bitcoin's price drops after I get paid?",
			answer:
				"Bitcoin's price can be volatile. To mitigate this, you can convert to stablecoins (like USDT or USDC) or your local currency immediately after receiving payment. Some freelancers hold a percentage in Bitcoin as a long-term savings strategy while converting the rest."
		},
		{
			question: 'Can I get paid in Bitcoin from a traditional employer?',
			answer:
				'Yes. Services like Bitwage let you receive a portion or all of your salary in Bitcoin, even if your employer pays in fiat. The service handles the conversion and sends Bitcoin to your wallet. Some employers in the Bitcoin space also pay directly in BTC.'
		},
		{
			question: 'What fees do I pay to receive Bitcoin?',
			answer:
				"Lightning Network fees are extremely low — typically less than 1 cent per transaction. On-chain Bitcoin transactions cost more ($0.50–$5 depending on network congestion) but are rarely needed for freelancing payments. BitTasker's service fee (5–10%) is separate from network fees."
		},
		{
			question: 'How do I set up a Lightning wallet as a beginner?',
			answer:
				"Download a Lightning wallet app (Blink, Aqua, or Wallet of Satoshi are beginner-friendly). Follow the in-app setup — it takes about 10 minutes. Write down your recovery seed phrase on paper and store it securely. You're ready to receive Lightning payments immediately after setup."
		}
	],
	bitTaskerCta: {
		heading: 'Start earning Bitcoin for your freelance work',
		body: 'BitTasker connects you with clients who pay instantly via the Lightning Network. Lower fees than Upwork or Fiverr, faster payments, and you own your identity through Nostr.',
		buttonText: 'Sign Up Free',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Get Paid in Bitcoin as a Freelancer',
		description:
			'Step-by-step guide to receiving Bitcoin payments for freelance work via the Lightning Network.',
		totalTime: 'PT20M',
		steps: [
			{
				name: 'Set up a Bitcoin wallet',
				text: 'Download a Lightning-compatible wallet such as Aqua Wallet, Blink, or Wallet of Satoshi. Write down your recovery seed phrase and store it securely.'
			},
			{
				name: 'Choose a Bitcoin-paying platform',
				text: 'Sign up on a Bitcoin freelancing platform like BitTasker, LaborX, or CryptoJobsList. Evaluate fees, payment methods, and the types of work available.'
			},
			{
				name: 'Complete your profile',
				text: 'Create a professional profile showcasing your skills, experience, and portfolio. Highlight any Bitcoin or Lightning-specific knowledge to stand out.'
			},
			{
				name: 'Invoice in Bitcoin',
				text: 'When accepting projects, provide your Lightning address or create an invoice. Specify payment in Bitcoin and agree on the amount and payment terms with the client.'
			},
			{
				name: 'Receive payment via Lightning',
				text: 'After completing the work and client approval, receive satoshis directly to your Lightning wallet. Payments arrive in seconds with minimal fees under a cent.'
			},
			{
				name: 'Optionally convert to local currency',
				text: 'Use an on-ramp service like Relai, Strike, or a peer-to-peer exchange to convert Bitcoin to your local currency if needed, or hold it as savings.'
			}
		]
	}
};
