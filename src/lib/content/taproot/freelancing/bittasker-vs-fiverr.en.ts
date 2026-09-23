import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker vs Fiverr: Bitcoin Freelancing Compared',
		subtitle:
			'Fiverr takes 20% and holds your money for 14 days. BitTasker offers lower fees and instant Bitcoin payouts.'
	},
	answerBlock:
		"BitTasker is a Bitcoin-native freelancing platform with tiered fees as low as 5%, compared to Fiverr's flat 20% commission on every transaction. Fiverr holds completed earnings for 14 days before releasing them, while BitTasker settles instantly via the Lightning Network. Freelancers on BitTasker own their identity through Nostr protocols, making their reputation portable and censorship-resistant — unlike Fiverr's centralized account system. For freelancers who want lower costs, faster payments, and true ownership of their work history, BitTasker outperforms Fiverr across every metric that matters.",
	sections: [
		{
			heading: 'How do BitTasker and Fiverr fees compare?',
			body: "Fiverr takes 20% from every transaction — both from what the buyer pays and from the seller's earnings. A $100 gig on Fiverr nets you $80 before you even account for processing fees. BitTasker's tiered model starts around 10% for new users and drops to 5% for established freelancers with strong track records. On that same $100 project, you keep $90–$95 on BitTasker. Over dozens of projects, the difference becomes thousands of dollars in retained earnings."
		},
		{
			heading: 'Why does Fiverr hold earnings for 14 days?',
			body: "Fiverr implements a 14-day clearance period after order completion before funds become available for withdrawal. This policy exists to cover chargebacks and disputes — but it penalizes every seller equally, even those with years of flawless history. Freelancers working gig to gig feel this acutely: a project completed on Monday isn't accessible until two Mondays later. BitTasker eliminates this entirely. Lightning Network payments arrive the moment the client confirms delivery, giving you immediate access to your earnings."
		},
		{
			heading: "How does Fiverr's gig model differ from BitTasker?",
			body: 'Fiverr is structured as a gig marketplace — sellers create predefined service listings ("gigs") with set prices and tiers. This works well for standardized services like logo design or voiceover work, but it forces freelancers into rigid pricing structures. BitTasker supports both structured gig-style listings and custom project proposals. Freelancers can price projects hourly, by milestone, or as fixed-price contracts. This flexibility better serves complex projects like software development, consulting, or multi-phase creative work.'
		},
		{
			heading: 'What about identity and account ownership?',
			body: 'Fiverr owns your profile, reviews, and seller reputation. If Fiverr suspends your account — which happens frequently to sellers who violate their evolving terms of service — you lose everything instantly. Years of five-star reviews, your follower base, and your level status vanish. BitTasker uses Nostr-based identity, meaning your reputation is tied to a cryptographic key pair you control. No platform can confiscate your track record. Your history travels with you, not with the platform.'
		},
		{
			heading: 'What does the BitTasker vs Fiverr comparison table show?',
			body: '| Feature | BitTasker | Fiverr |\n| --- | --- | --- |\n| Service fee | 5–10% (tiered) | 20% flat |\n| Payment hold | None — instant | 14-day clearance |\n| Payment method | Bitcoin Lightning | Bank transfer / PayPal |\n| Identity | Nostr (self-sovereign) | Centralized account |\n| Pricing model | Flexible (hourly, fixed, milestone) | Rigid gig tiers |\n| Account portability | Full — portable reputation | Locked to platform |\n| Dispute resolution | On-chain smart contracts | Fiverr support team |\n| Global access | Permissionless | Restricted countries |'
		},
		{
			heading: 'When is Fiverr the better choice?',
			body: "Fiverr excels for freelancers selling standardized, repeatable services — logo packages, social media graphics, short video edits. Its gig model and buyer search algorithm have massive traffic. If you're a beginner building a portfolio and prefer the simplicity of fiat payments to a bank account, Fiverr's lower barrier to entry and established buyer base can help you land your first clients quickly."
		},
		{
			heading: 'When is BitTasker the better choice?',
			body: "BitTasker is the better choice for freelancers who are tired of losing 20% of every paycheck to platform fees. It's built for remote workers in Latin America, Africa, and Southeast Asia where banking access is limited and remittance fees eat into earnings. It's ideal for developers, consultants, and creative professionals who need flexible project structures. And it's the platform for anyone who values true ownership — freelancers who've been burned by centralized platform suspensions or who want a portable, censorship-resistant reputation."
		}
	],
	faq: [
		{
			question: 'Is BitTasker really cheaper than Fiverr?',
			answer:
				"Yes. BitTasker's fees range from 5–10% compared to Fiverr's flat 20%. On a $500 project, you save $50–$75 per job. For freelancers doing consistent work, the annual savings are substantial."
		},
		{
			question: 'Can I list services on BitTasker like Fiverr gigs?',
			answer:
				'BitTasker supports both structured gig-style service listings and custom project proposals. You can create fixed-price packages similar to Fiverr gigs, or set hourly rates and milestone-based contracts for more complex work.'
		},
		{
			question: 'How fast do I actually get paid on BitTasker?',
			answer:
				'Instantly. BitTasker uses the Lightning Network for payments. The moment a client marks your work as delivered and approved, satoshis land in your wallet. No 14-day waiting period, no bank processing delays.'
		},
		{
			question: 'What if Fiverr suspends my account — can I move to BitTasker?',
			answer:
				"Yes. While your Fiverr reviews can't transfer directly, you can reference your Fiverr portfolio when creating your BitTasker profile. Your new Nostr-based reputation will grow from your first completed project, and this time, no platform can take it away."
		},
		{
			question: 'Does BitTasker support the same service categories as Fiverr?',
			answer:
				'BitTasker covers the major freelance categories: development, design, writing, translation, marketing, and consulting. While Fiverr has more niche micro-gig categories, BitTasker focuses on quality professional services where lower fees and faster payments make the biggest impact.'
		},
		{
			question: 'Do I need a Bitcoin wallet to use BitTasker?',
			answer:
				'Yes. You need a Lightning-compatible Bitcoin wallet to receive payments. Popular options include Aqua Wallet, Blink Wallet, and Wallet of Satoshi. Setup takes about 10 minutes, and BitTasker provides step-by-step guides.'
		}
	],
	bitTaskerCta: {
		heading: 'Stop giving 20% of your earnings to platform fees',
		body: "BitTasker's tiered fees and instant Lightning payouts let you keep more of what you earn. Join the freelancers who've switched from Fiverr to a platform built for the Bitcoin economy.",
		buttonText: 'Start Freelancing on BitTasker',
		buttonHref: '/auth/signup'
	}
};
