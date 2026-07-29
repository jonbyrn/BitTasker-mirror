import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Freelancer.com vs Upwork: Which Wins?',
		subtitle:
			'Honest comparison of the two veteran freelance platforms — fees, escrow, disputes, and talent quality'
	},
	answerBlock:
		'Freelancer.com and Upwork are two of the oldest freelance platforms, but they serve different markets. Upwork charges a flat 10% service fee and focuses on vetted, higher-quality projects with milestone escrow. Freelancer.com charges 10% or $5 (whichever is greater) and is known for its contest model and lower-budget projects. Upwork generally attracts better clients and higher rates, while Freelancer.com has lower barriers to entry and more affordable options for budget-conscious buyers. For freelancers who want even lower fees and instant payouts, BitTasker charges just 5% with Bitcoin Lightning payments.',
	sections: [
		{
			heading: 'How does Freelancer.com compare to Upwork side by side?',
			body: '| Feature | Freelancer.com | Upwork | BitTasker |\n|---|---|---|---|\n| Freelancer Fee | 10% or $5 minimum | 10% flat | 5% flat |\n| Withdrawal Fee | $0–$30 (method-dependent) | $0–$2 (method-dependent) | Near-zero (Lightning) |\n| Project Model | Bids + Contests | Bids + Proposals | Task-based |\n| Escrow | Yes (milestone) | Yes (milestone) | Yes (Bitcoin escrow) |\n| Hourly Support | Yes | Yes (with time tracker) | Yes |\n| Contest Model | Yes (design contests) | No | No |\n| Payout Speed | 3–5 days | 5–10 days | Instant |\n| Talent Quality | Mixed | Higher average | Varies |\n| Client Quality | Budget-focused | Mid-to-enterprise | Crypto-native |\n| Free Members | Yes (limited bids) | No (connects cost money) | Yes (free to bid) |'
		},
		{
			heading: 'How do Freelancer.com and Upwork fees compare?',
			body: "Freelancer.com charges 10% or $5, whichever is greater. On a $30 project, you lose $5 (16.7%). On a $500 project, you lose $50 (10%). Upwork charges a flat 10% on all earnings — $3 on a $30 project, $50 on a $500 project. The key difference is on small projects: Freelancer.com's $5 minimum means higher percentage fees on low-value work. Both platforms charge withdrawal fees that vary by method. BitTasker's flat 5% means $2.50 on a $50 project and $25 on a $500 project — consistently half of both competitors."
		},
		{
			heading: "How does Freelancer.com's contest model work?",
			body: "Freelancer.com's contest model lets clients post a brief (logo, design, app concept) and multiple freelancers submit entries. The client picks the winner and pays only that freelancer. This creates competition that can benefit clients with lower costs but pressures freelancers into speculative unpaid work. Upwork does not have contests — you bid on defined projects. If you are a designer who thrives on competition, Freelancer.com's contests may appeal. If you prefer guaranteed payment for proposals, Upwork's model is better. BitTasker uses a task-based model where you get paid upon completion — no speculative work."
		},
		{
			heading: 'How do Freelancer.com and Upwork compare on escrow and payment protection?',
			body: "Both platforms offer milestone-based escrow for fixed-price projects. Upwork's escrow system is more robust — clients must fund milestones before work begins, and the platform mediates disputes. Freelancer.com offers escrow but has faced criticism for slower dispute resolution and less freelancer-friendly outcomes. For hourly projects, Upwork's time tracker provides automatic protection — if the tracker is running, you get paid. Freelancer.com's hourly protection is less reliable. BitTasker uses Bitcoin smart contract escrow — funds are locked on-chain and released when both parties agree, with no centralized mediator."
		},
		{
			heading: 'How do Freelancer.com and Upwork compare on talent quality and client base?',
			body: "Upwork attracts a higher caliber of clients — mid-market companies, agencies, and enterprises. Freelancers with strong profiles earn $50–$200+/hour. The platform's skill tests and JSS (Job Success Score) system help maintain quality. Freelancer.com has a broader range, from serious businesses to budget buyers seeking the lowest bid. Rates tend to be lower, and competition is fiercer. BitTasker's client base includes crypto-native businesses, startups, and international clients who value speed and low fees over platform prestige."
		},
		{
			heading: 'Which Platform Should You Choose?',
			body: 'Choose Upwork if you want higher-quality clients, better escrow protection, and are willing to pay 10% plus connect costs. Choose Freelancer.com if you want a lower barrier to entry, enjoy contest-based work, or serve budget-conscious clients. Choose BitTasker if you want the lowest fees (5%), instant payouts via Bitcoin, and no connect costs. The ideal strategy is to test all three — Freelancer.com for volume, Upwork for quality, and BitTasker for crypto payments and local tasks.'
		}
	],
	faq: [
		{
			question: 'Is Freelancer.com better than Upwork?',
			answer:
				'It depends on your needs. Freelancer.com has lower barriers to entry and a contest model that some designers prefer. Upwork has higher-quality clients, better escrow, and a more professional ecosystem. BitTasker offers lower fees and instant payouts.'
		},
		{
			question: 'Which platform charges lower fees: Freelancer.com or Upwork?',
			answer:
				'Both charge roughly 10%, but Freelancer.com has a $5 minimum that increases the percentage on small projects. Upwork charges a flat 10% with no minimum. BitTasker charges a flat 5% — half of both.'
		},
		{
			question: 'Does Freelancer.com have escrow like Upwork?',
			answer:
				"Yes, both offer milestone-based escrow. Upwork's escrow is generally considered more reliable and freelancer-friendly. Freelancer.com's escrow works but has slower dispute resolution."
		},
		{
			question: 'Which platform has better clients?',
			answer:
				'Upwork attracts mid-market to enterprise clients with larger budgets. Freelancer.com has more budget-focused clients. BitTasker serves crypto-native businesses and international clients.'
		},
		{
			question: 'Can I earn Bitcoin on Freelancer.com or Upwork?',
			answer:
				'Neither platform natively supports Bitcoin payments. BitTasker is the primary freelance platform with native Bitcoin payouts via the Lightning Network.'
		},
		{
			question: "What is Freelancer.com's contest model?",
			answer:
				'Clients post a design or development brief, multiple freelancers submit entries competing for the project. The client picks the winner and pays only that freelancer. It favors clients but requires speculative unpaid work from freelancers.'
		},
		{
			question: 'Which platform is better for beginners?',
			answer:
				'Freelancer.com has a lower barrier to entry with free membership tiers. Upwork requires purchasing connects. BitTasker is free to bid with a 5% fee on completed work — the simplest model for beginners.'
		}
	],
	bitTaskerCta: {
		heading: 'Half the Fees, Instant Payments',
		body: 'BitTasker charges 5% — half of what both Freelancer.com and Upwork take. Earn Bitcoin via the Lightning Network with instant payouts. No connects, no contest speculation, no waiting for bank transfers.',
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
