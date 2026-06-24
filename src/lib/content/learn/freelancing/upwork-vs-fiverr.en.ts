import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Upwork vs Fiverr: Which Is Better?',
		subtitle:
			'Honest comparison of fees, workflow, payouts, and who wins for each type of freelancer'
	},
	answerBlock:
		'Upwork is better for custom projects, hourly work, and long-term client relationships. Fiverr is better for standardized services, quick turnarounds, and building a storefront. Upwork charges a 10% freelancer service fee while Fiverr takes 20%. Upwork pays in 5–10 business days; Fiverr holds funds for 14 days for new sellers. For freelancers who want to keep more of their earnings with instant payouts, BitTasker charges just 5% and pays via the Bitcoin Lightning Network in seconds.',
	sections: [
		{
			heading: 'How does Upwork compare to Fiverr side by side?',
			body: 'Here is a detailed comparison of the two largest freelance platforms in the world.\n\n| Feature | Upwork | Fiverr | BitTasker |\n|---|---|---|---|\n| Freelancer Fee | 10% on all earnings | 20% on all earnings | 5% on all earnings |\n| Client Fee | 3–5% processing | 5.5% processing | Minimal |\n| How It Works | Bid on posted projects | Sell predefined gigs | Post or accept tasks |\n| Payout Speed | 5–10 business days | 14 days (new sellers) | Instant (Lightning) |\n| Escrow | Yes (milestone-based) | Yes (order-based) | Yes (Bitcoin escrow) |\n| Hourly Work | Yes (time tracking) | No (fixed price only) | Yes |\n| Project Types | Custom, complex projects | Standardized services | Local tasks & remote work |\n| Connects/Leads | $0.15 per connect | Free to list | Free to bid |\n| Dispute Resolution | Upwork mediates | Fiverr mediates | On-chain resolution |\n| Best For | Developers, consultants | Designers, voice artists | Crypto-paying clients, local tasks |'
		},
		{
			heading: 'What types of projects is Upwork better for?',
			body: "Upwork excels when projects are complex, multi-phase, or require ongoing collaboration. The milestone-based escrow system protects both parties on large projects. Upwork's time tracker is ideal for hourly contracts — clients see work in real-time and freelancers get paid for every tracked hour. If you are a developer, consultant, writer, or virtual assistant doing custom work, Upwork's bidding model lets you negotiate scope, timeline, and rate before starting. The 10% fee is steep but reasonable for the protections and client quality you get."
		},
		{
			heading: 'What types of services is Fiverr better for?',
			body: "Fiverr's storefront model works best when you can package your service into a repeatable offering. Logo design, video intros, voice-overs, social media posts, and data entry are natural fits. You set your price, create a listing, and buyers come to you — no bidding required. The tradeoff is Fiverr's 20% fee and the intense competition that drives prices down. Top Fiverr sellers with strong reviews can charge premium rates, but breaking through as a new seller is difficult without promotional spending."
		},
		{
			heading: 'How much do you actually keep after Upwork and Fiverr fees?',
			body: "Let's calculate real earnings on a $1,000 project across platforms.\n\nOn Upwork: You earn $1,000, Upwork takes 10% ($100), you keep $900. Withdrawal fees: $0–2 depending on method.\nOn Fiverr: You earn $1,000, Fiverr takes 20% ($200), you keep $800. Withdrawal fees: $1–3 depending on method.\nOn BitTasker: You earn $1,000, BitTasker takes 5% ($50), you keep $950. Payout via Lightning: instant, negligible fee.\n\nOver a year of $1,000/month earnings, the difference between Upwork and BitTasker is $600. Between Fiverr and BitTasker, it is $1,800."
		},
		{
			heading: 'How do Upwork and Fiverr compare on client quality and project volume?',
			body: "Upwork attracts clients with larger budgets and more complex needs — enterprise software, marketing strategy, content campaigns. The vetting process (both for freelancers and clients) creates a higher-quality marketplace but smaller volume. Fiverr has massive volume with millions of buyers, but many are looking for the cheapest option. This creates downward price pressure. BitTasker's client base includes crypto-native businesses and international clients who value quality work and want to pay instantly in Bitcoin."
		},
		{
			heading: 'How do Upwork and Fiverr compare on payout speed?',
			body: "Cash flow matters enormously for freelancers. Upwork's 5–10 day payout means you finish work on Friday and get paid the following week. Fiverr's 14-day hold for new sellers means two full weeks between delivery and access to your money. For freelancers with rent due and bills to pay, these delays create real financial stress. BitTasker pays instantly upon task approval via the Bitcoin Lightning Network — your earnings are in your wallet within seconds, ready to spend, save, or convert."
		},
		{
			heading: 'Which Platform Should You Start With?',
			body: 'If you are new to freelancing, Fiverr is easier to start — no bidding, just create gigs and wait for buyers. Upwork requires an active approach (writing proposals, bidding on projects) but gives more control over which clients you work with. If you want the lowest fees and fastest payouts from day one, BitTasker is the best option for task-based and crypto-friendly work. The ideal strategy is to use 2–3 platforms simultaneously and let client response guide where you invest your time.'
		}
	],
	faq: [
		{
			question: 'Is Upwork better than Fiverr for beginners?',
			answer:
				'Fiverr is easier for absolute beginners because you create listings and wait for buyers. Upwork requires writing proposals and bidding, which takes more effort but gives you control over client selection. For instant payouts and low fees, BitTasker is the simplest option.'
		},
		{
			question: 'Which platform pays more: Upwork or Fiverr?',
			answer:
				"Upwork lets you keep more per dollar earned because its 10% fee is half of Fiverr's 20%. On a $1,000 project, you keep $900 on Upwork vs $800 on Fiverr. BitTasker lets you keep $950 on the same project."
		},
		{
			question: 'Can you make a full-time income on Upwork or Fiverr?',
			answer:
				"Yes, many freelancers earn $50K–$150K+ on both platforms. Upwork is more suited for higher-earning professionals doing complex work. Fiverr's top sellers earn well, but most sellers earn modest amounts due to price competition."
		},
		{
			question: 'What are the main differences between Upwork and Fiverr?',
			answer:
				'Upwork is a bidding platform where you apply to projects. Fiverr is a marketplace where buyers find your services. Upwork charges 10%, Fiverr charges 20%. Upwork supports hourly work; Fiverr is fixed-price only. Upwork pays in 5–10 days; Fiverr holds 14 days for new sellers.'
		},
		{
			question: 'Is there a platform better than both Upwork and Fiverr?',
			answer:
				'BitTasker offers lower fees (5%), instant Bitcoin payouts, and no connect costs. Contra offers 0% commission. Toptal offers elite-level clients with zero freelancer fees but a rigorous screening process.'
		},
		{
			question: 'How do Upwork and Fiverr compare on dispute resolution?',
			answer:
				"Both platforms mediate disputes between clients and freelancers. Upwork's milestone escrow gives better protection for multi-phase projects. Fiverr's resolution center handles order issues but is generally considered less freelancer-friendly."
		}
	],
	bitTaskerCta: {
		heading: 'What If You Could Keep More of Your Earnings?',
		body: "BitTasker charges just 5% — half of Upwork's fee and a quarter of Fiverr's. With instant Bitcoin payouts via Lightning, you get paid in seconds, not weeks. No connects, no bidding wars, no algorithm controlling your visibility. Try the platform that puts freelancers first.",
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
