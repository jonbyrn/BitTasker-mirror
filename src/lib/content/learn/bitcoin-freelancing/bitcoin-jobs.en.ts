import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Jobs: Find Freelance Work That Pays in BTC',
		subtitle:
			'Discover legitimate Bitcoin-paying jobs for developers, designers, writers, and more — earning $1K–$3K/month.'
	},
	answerBlock:
		'Bitcoin jobs are freelance and remote positions that pay in Bitcoin or satoshis, available across platforms like BitTasker, LaborX, CryptoJobsList, and AngelList. The most in-demand roles include software development, UI/UX design, content writing, translation, and digital marketing. Legitimate Bitcoin jobs pay through the Lightning Network or on-chain transactions, never requiring upfront fees from workers. Freelancers can earn $1,000 to $3,000/month or more depending on skills and hours worked. BitTasker is the leading platform for Bitcoin-paying freelance work in Latin America, with lower fees, instant payouts, and decentralized identity.',
	sections: [
		{
			heading: 'Where can I find legitimate Bitcoin-paying jobs?',
			body: 'The Bitcoin freelancing ecosystem has matured significantly. BitTasker is purpose-built for Bitcoin-paying freelance work, focusing on Latin America with Nostr identity and instant Lightning payments. LaborX offers a global marketplace with Bitcoin escrow for all project types. CryptoJobsList curates remote crypto job listings across categories. AngelList features startup roles that sometimes pay in Bitcoin. BitcoinerJobs and Built In\'s crypto section also list legitimate positions. When evaluating any platform, check that payments flow through established Bitcoin wallets — never send money to "verify" your account or pay upfront fees.'
		},
		{
			heading: 'What types of work pay in Bitcoin?',
			body: 'The highest-paying Bitcoin freelance categories are software development (full-stack, mobile, smart contracts, Lightning), UI/UX design, technical writing, content marketing, translation services, video production, and consulting. Developer roles command the highest rates — $50–$150/hour for experienced engineers. Design and creative roles typically pay $30–$80/hour. Writing and translation roles range from $20–$60/hour. Local services (delivery, handyman, cleaning) are emerging on platforms like BitTasker, typically paying $10–$30 per task. Bitcoin-native skills like Lightning development and Nostr protocol work command premium rates due to scarcity.'
		},
		{
			heading: 'How do I evaluate a Bitcoin job offer?',
			body: "Evaluate Bitcoin job offers using the same criteria you'd apply to any freelance gig: verify the client's history and reviews on the platform, confirm the payment method and fee structure in writing, and ensure escrow is in place before starting work. Red flags include: requests for upfront payment, promises of unusually high returns for simple work, vague project descriptions, and pressure to move communication off-platform. Legitimate Bitcoin jobs use platform escrow (BitTasker uses Rootstock smart contracts) and pay through established Lightning or on-chain transactions."
		},
		{
			heading: 'How do I avoid Bitcoin job scams?',
			body: 'Bitcoin job scams follow predictable patterns. The most common: fake "data entry" or "crypto trading" jobs that require you to deposit Bitcoin first. These are always scams — legitimate employers pay you, not the other way around. Other red flags: clients asking for your private keys or seed phrase (never share these), fake job listings that link to phishing sites, and "too good to be true" hourly rates ($500/hour for data entry). Protect yourself by using only established platforms with escrow, never sharing wallet credentials, and trusting your instincts when something feels wrong.'
		},
		{
			heading: 'What skills command the highest Bitcoin rates?',
			body: "The Bitcoin job market rewards specialized skills. Lightning Network development is in extremely high demand with rates of $100–$200/hour. Nostr protocol development, Bitcoin smart contract (Rootstock) development, and Bitcoin custody solution engineering command $80–$150/hour. Full-stack development with Bitcoin integration pays $60–$120/hour. General web and mobile development pays $40–$80/hour. The premium for Bitcoin-specific skills reflects the scarcity of qualified developers. If you're considering upskilling, Lightning and Nostr development offer the highest return on investment in the Bitcoin freelancing market."
		},
		{
			heading: 'Can beginners find Bitcoin-paying work?',
			body: 'Yes, but at lower rates while building a reputation. Entry-level Bitcoin freelancing roles include: basic web development, content writing about Bitcoin and crypto topics, translation services, virtual assistance, and social media management. These typically pay $15–$30/hour. As you build your platform reputation (especially a portable Nostr-based reputation on BitTasker), rates increase. Many successful Bitcoin freelancers started in entry-level roles and worked their way up by delivering consistent quality and building verifiable track records.'
		},
		{
			heading: 'How do Bitcoin jobs compare to traditional freelance platforms?',
			body: 'Bitcoin-paying job platforms offer several advantages over traditional freelance sites. Lower fees (BitTasker: 5–10% vs Upwork: 20%). Faster payments (instant Lightning vs Net-14). Censorship-resistant identity (Nostr vs centralized accounts). Open access (no geographic restrictions). However, the client pool is smaller, the learning curve for wallet setup is real, and Bitcoin price volatility requires active management. For freelancers willing to adapt, the Bitcoin freelance market offers better economics and more freedom than traditional platforms.'
		}
	],
	faq: [
		{
			question: 'How much can I realistically earn from Bitcoin freelance jobs?',
			answer:
				'Part-time freelancers typically earn $500–$1,500/month. Full-time freelancers with in-demand skills earn $2,000–$5,000/month. Specialized developers (Lightning, Nostr, smart contracts) can earn $5,000–$10,000+/month. Rates depend on your skill level, specialization, hours worked, and platform reputation.'
		},
		{
			question: 'Do I need to know about Bitcoin to get Bitcoin-paying jobs?',
			answer:
				"You need basic Bitcoin knowledge for most roles — how wallets work, how Lightning payments function, and general crypto awareness. For technical roles, you'll need deeper expertise. Many Bitcoin-paying jobs (writing, design, translation) don't require Bitcoin-specific skills beyond basic wallet familiarity."
		},
		{
			question: 'Are Bitcoin-paying jobs legitimate?',
			answer:
				"Many are legitimate, but scams exist. Stick to established platforms like BitTasker and LaborX, use escrow for every project, and never pay upfront fees. If a job asks for your private keys, seed phrase, or an upfront Bitcoin deposit, it's a scam. Legitimate jobs pay you — not the other way around."
		},
		{
			question: 'Can I work Bitcoin-paying jobs from any country?',
			answer:
				'Yes. Bitcoin-paying freelance platforms are open-access — anyone with an internet connection and a Bitcoin wallet can participate. This is especially valuable in countries with limited access to traditional freelancing platforms or banking services. El Salvador, where Bitcoin is legal tender, has a particularly vibrant Bitcoin job market.'
		},
		{
			question: 'What is the best platform for Bitcoin freelance jobs?',
			answer:
				'BitTasker is the best platform for Latin American freelancers, offering the lowest fees, instant Lightning payments, and portable Nostr identity. LaborX is strong for global freelance work. CryptoJobsList is best for discovering remote crypto job listings. The right platform depends on your location, skills, and work preferences.'
		},
		{
			question: 'How do I get started with Bitcoin freelancing?',
			answer:
				'Set up a Lightning wallet (Blink, Aqua, or Wallet of Satoshi), create a profile on BitTasker or your preferred platform, complete your portfolio with relevant work samples, and start applying to projects. Build your reputation through consistent delivery and positive reviews.'
		}
	],
	bitTaskerCta: {
		heading: 'Find Bitcoin-paying work on BitTasker',
		body: 'BitTasker connects freelancers with clients who pay instantly in Bitcoin. Lower fees, faster payments, and a decentralized reputation you own. Start building your Bitcoin freelance career today.',
		buttonText: 'Browse Bitcoin Jobs',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Find and Apply for Bitcoin-Paying Jobs',
		description:
			'Step-by-step guide to discovering legitimate Bitcoin freelance work and landing your first paid project.',
		totalTime: 'PT15M',
		steps: [
			{
				name: 'Search Bitcoin job boards',
				text: 'Browse platforms like BitTasker, LaborX, CryptoJobsList, and BitcoinerJobs for available positions. Filter by your skills and preferred work arrangement.'
			},
			{
				name: 'Evaluate job legitimacy',
				text: 'Verify that the platform uses escrow, the client has a track record, and the job does not require upfront payments. Red flags include requests for seed phrases or unusually high rates for simple work.'
			},
			{
				name: 'Set up your portfolio',
				text: 'Prepare work samples, case studies, or a portfolio website showcasing your relevant experience. Bitcoin-native skills like Lightning or Nostr development command premium rates.'
			},
			{
				name: 'Apply with Bitcoin address',
				text: 'Submit your application with a Lightning address or Bitcoin wallet for receiving payment. Include your Nostr identity if the platform supports decentralized profiles.'
			},
			{
				name: 'Negotiate payment terms',
				text: 'Agree on payment amount, currency (BTC or sats), payment method (Lightning or on-chain), and milestone structure before starting work. Ensure escrow is funded before delivering.'
			}
		]
	}
};
