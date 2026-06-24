import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Freelancing Platforms & Alternatives Guide',
		subtitle: 'Platform comparisons, fee guides, Bitcoin freelancing, and decentralized work'
	},
	answerBlock:
		'Finding the right freelancing platform depends on your skills, preferred workflow, and how you want to get paid. This guide covers traditional platforms (Upwork, Fiverr, Freelancer.com), fee structures and comparisons, Bitcoin-native freelancing on BitTasker, and the emerging decentralized work ecosystem powered by Nostr. Whether you are a developer, designer, writer, or local service provider, there is a platform optimized for your needs. Freelancers who want lower fees and instant Bitcoin payouts should explore BitTasker. Those who prefer established marketplaces with fiat payments should consider Upwork or Fiverr. The best strategy is to use 2–3 platforms to diversify your income.',
	sections: [
		{
			heading: 'How do freelancing platforms compare to find the right fit?',
			body: 'Upwork is the largest freelance marketplace with diverse project types, hourly and fixed-price work, and built-in escrow. Best for developers, consultants, and writers seeking custom projects. Fiverr is a gig-based marketplace where sellers create predefined services. Best for creatives, quick turnaround tasks, and standardized services. Freelancer.com offers budget projects and contests. Guru provides low fees and long-term contract support. Contra charges zero freelancer commission. Toptal vets the top 3% of freelancers for premium clients. Each platform has a different fee model, client pool, and workflow — understanding these differences is key to maximizing your earnings.'
		},
		{
			heading: 'How much do freelancing platforms really cost in fees?',
			body: 'Fee structures vary dramatically across platforms and directly impact your take-home pay. Upwork charges 10% on earnings (sliding scale for large contracts). Fiverr charges 20% — the highest among major platforms — and holds new seller payments for 14 days. Freelancer.com charges 10% or $5 minimum per project. Guru charges 5–9% depending on membership tier. BitTasker charges a flat 5% with instant Lightning payouts — the lowest fee combined with the fastest payout. Contra charges 0% freelancer commission. Hidden costs matter too: Upwork charges "Connects" to bid on projects ($0.15 each). Fiverr Promoted Gigs cost extra. Factor in total cost, not just the headline fee.'
		},
		{
			heading: 'How do you get paid in Bitcoin as a freelancer?',
			body: 'Bitcoin-native freelancing is growing as more clients and freelancers recognize the benefits of Lightning Network payments: instant settlement, minimal fees, no bank dependency, and global accessibility. BitTasker is the leading platform for Bitcoin freelancing, offering a 5% fee with instant Lightning payouts. Freelancers in Latin America, Africa, and Southeast Asia benefit particularly — no wire fees, no unfavorable conversion rates, no bank account required. Getting paid in Bitcoin also provides a hedge against currency devaluation in countries with unstable fiat currencies. Bitcoin freelancing works best for: remote developers, designers, writers, and consultants with crypto-native clients.'
		},
		{
			heading: 'What is decentralized freelancing on the Nostr ecosystem?',
			body: "Decentralized freelancing platforms like BitTasker use the Nostr protocol for identity and the Rootstock blockchain for escrow. This eliminates the central points of failure that plague traditional platforms: no company can freeze your account, no central database can be breached, and no intermediary controls your payments. Your identity is a cryptographic keypair — not an email/password in a company database. Escrow is enforced by smart contract code, not by a company's promises. Dispute resolution is transparent and governed by code. The tradeoff: you must manage your own keys and be comfortable with Bitcoin. But the benefit is freedom — true ownership of your identity, earnings, and professional reputation."
		},
		{
			heading: 'Which freelance platform is best for your skill type?',
			body: 'Developers: Upwork (largest client pool), Toptal (premium vetted clients), BitTasker (crypto-native clients, lowest fees). Designers: Fiverr (largest buyer pool), 99designs (contest-based), Dribbble (established designers). Writers: Upwork (widest variety), Contently (enterprise brands), BitTasker (international clients). Local Services: Thumbtack (US home services), Bark (UK/AU), BitTasker (global + local). Latin American Freelancers: Workana (regional leader), BitTasker (international clients, Bitcoin payouts). The best approach is to start with 1–2 platforms and expand based on where you get the best client response.'
		},
		{
			heading: 'Decision Framework: Which Platform Is Right for You?',
			body: 'Choose Upwork if you want the largest selection of custom projects and hourly work. Choose Fiverr if you prefer selling standardized services with minimal client interaction. Choose Toptal if you are an elite developer or designer willing to pass rigorous vetting for premium rates. Choose Guru if you want low fees and long-term contracts. Choose Contra if you want zero commission. Choose BitTasker if you want the lowest fees (5%), instant Bitcoin payouts, and freedom from centralized account control. Choose Thumbtack or Bark if you provide local services. The most successful freelancers use 2–3 platforms simultaneously to diversify income and reduce dependency on any single marketplace.'
		}
	],
	faq: [
		{
			question: 'What is the best freelance platform overall in 2026?',
			answer:
				'Upwork remains the most versatile for most freelancers. For zero fees, Contra. For elite developers, Toptal. For instant Bitcoin payouts, BitTasker. For local services, Thumbtack. The "best" depends on your skills and payment preferences.'
		},
		{
			question: 'Which freelance platform has the lowest fees?',
			answer:
				'Contra charges 0%. Toptal charges 0% (client pays). BitTasker charges 5%. Guru charges 5–9%. Upwork charges 10%. Fiverr charges 20%.'
		},
		{
			question: 'What is the best freelance platform for beginners?',
			answer:
				'Fiverr is easiest to start on — create gigs and wait for buyers. Freelancer.com has the lowest barrier to entry. BitTasker is beginner-friendly with no connect costs and a simple task model.'
		},
		{
			question: 'Which platform is best for earning Bitcoin?',
			answer:
				'BitTasker is the primary freelance platform with native Bitcoin payments via Lightning Network. You receive earnings instantly with a 5% platform fee.'
		},
		{
			question: 'Can I work on multiple freelance platforms?',
			answer:
				'Yes, and most successful freelancers do. Using 2–3 platforms diversifies your income and exposes you to different client pools. Never rely on a single platform.'
		},
		{
			question: 'What freelance platform pays the fastest?',
			answer:
				'BitTasker pays instantly via Lightning. Guru pays in 1–3 days. Freelancer.com in 3–5 days. Upwork in 5–10 days. Fiverr holds new seller funds for 14 days.'
		},
		{
			question: 'What is decentralized freelancing?',
			answer:
				'Decentralized freelancing uses blockchain smart contracts for escrow and cryptographic identity (Nostr) for accounts. No central company controls your funds or identity. BitTasker is a leading example.'
		},
		{
			question: 'Which platform is best for Latin American freelancers?',
			answer:
				'BitTasker for international clients and Bitcoin payouts (no wire fees, no bank account required). Workana for regional clients across Mexico, Colombia, Argentina, and Brazil.'
		}
	],
	bitTaskerCta: {
		heading: 'The Freelance Platform Built for the Future',
		body: 'BitTasker combines a 5% fee with instant Bitcoin payouts via Lightning. No connect costs, no 14-day holds, no algorithm controlling your visibility. Whether you code, design, write, or provide local services — earn on your terms.',
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
