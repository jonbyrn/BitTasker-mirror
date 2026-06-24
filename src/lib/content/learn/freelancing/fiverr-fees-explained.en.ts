import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Fiverr Fees Explained: What Sellers Really Pay',
		subtitle:
			"Complete breakdown of Fiverr's 20% fee, processing charges, and withdrawal costs — with real earnings calculations"
	},
	answerBlock:
		'Fiverr takes 20% of every order as a service fee — the highest among major freelance platforms. On a $100 gig, you keep $80. On a $500 project, you keep $400. Fiverr also charges processing fees on withdrawals ($1–$3 depending on method) and holds new seller earnings for 14 days. For a freelancer earning $5,000/month on Fiverr, the platform takes $1,200/year in service fees alone. BitTasker charges just 5% with instant Bitcoin payouts — on the same $5,000/month, you would keep $5,700 more per year.',
	sections: [
		{
			heading: "How does Fiverr's 20% service fee work?",
			body: "Fiverr deducts 20% from every payment before it reaches your balance. There are no exceptions, no volume discounts, and no tier reductions. When a buyer pays $100 for your gig, $20 goes to Fiverr immediately and $80 enters your pending balance. This applies to the gig price, tips, and any additional services (add-ons). Fiverr's fee is the highest percentage among all major platforms — Upwork charges 10%, Guru charges 5–9%, and BitTasker charges 5%. The 20% fee means you need to price your services 25% higher than you would on a 0% platform to earn the same amount."
		},
		{
			heading: 'How long does Fiverr hold your money before withdrawal?',
			body: 'New sellers (under 60 days or without a certain volume of completed orders) face a 14-day clearance period after delivery. This means even after a buyer confirms the order is complete, your funds sit in "pending" status for two full weeks before becoming available for withdrawal. For established sellers who meet Fiverr\'s requirements, the clearance drops to 7 days. This delay is brutal for cash flow — if you deliver a $500 project on January 1st, you cannot access those funds until January 15th. BitTasker pays instantly upon task approval via Lightning Network.'
		},
		{
			heading: "What are Fiverr's withdrawal fees and methods?",
			body: "| Withdrawal Method | Fee | Speed | Minimum | Notes |\n|---|---|---|---|---|\n| PayPal | $1–$2 | Instant to minutes | $1 | Widely available |\n| Payoneer | $3 | 2–5 business days | $20 | Good for international |\n| Bank Transfer (ACH) | $1 | 1–2 business days | $1 | US only |\n| Fiverr Revenue Card | $1–$3 | 2–5 business days | $50 | Payoneer-based |\n| BitTasker (Bitcoin) | Near-zero | Instant | None | Via Lightning Network |\n\nInternational sellers face the worst combination: Fiverr's 20% service fee plus $3 Payoneer withdrawal fees plus currency conversion charges. On a $1,000 order from a Latin American seller, total fees can reach $230+ — you keep less than 77%."
		},
		{
			heading: 'How much do you actually keep after Fiverr fees?',
			body: 'Here are real take-home amounts on common Fiverr orders.\n\n$25 gig: Fiverr takes $5 (20%), withdrawal ~$1. You keep: $19 (76%)\n$100 gig: Fiverr takes $20 (20%), withdrawal ~$1. You keep: $79 (79%)\n$500 project: Fiverr takes $100 (20%), withdrawal ~$2. You keep: $398 (79.6%)\n$1,000 project: Fiverr takes $200 (20%), withdrawal ~$3. You keep: $797 (79.7%)\n\nOn Fiverr, you consistently lose about 20.5% of every dollar earned. If you earn $4,000/month (a solid Fiverr income), Fiverr takes approximately $9,840/year in combined service and withdrawal fees. On BitTasker at 5%, you would pay $2,400/year — saving $7,440 annually.'
		},
		{
			heading: 'How do Fiverr fees compare to Upwork and BitTasker?',
			body: '| Factor | Fiverr | Upwork | BitTasker |\n|---|---|---|---|\n| Service Fee | 20% | 10% | 5% |\n| Connect/Listing Cost | Free | $0.15/proposal | Free |\n| Clearance Period | 14 days (new) / 7 days | 5–10 days | Instant |\n| Withdrawal Fee | $1–$3 | $0–$30 | Near-zero |\n| Total on $1,000 | ~$800 kept | ~$897 kept | ~$950 kept |\n| Total on $5,000 | ~$4,000 kept | ~$4,485 kept | ~$4,750 kept |\n| Annual on $4K/mo | ~$38,160 kept | ~$42,960 kept | ~$45,600 kept |\n\nFiverr is the most expensive platform per dollar earned. Over a year of $4,000/month earnings, BitTasker saves you $7,440 compared to Fiverr and $2,640 compared to Upwork.'
		},
		{
			heading: 'What additional Fiverr fees do sellers often miss?',
			body: 'Beyond the 20% service fee, Fiverr has costs that many sellers overlook: Fiverr Learn courses ($20–$100+) for skill development, Promoted Gigs (paying for visibility, $0.50–$5+ per click), and the Fiverr workspace tools ($9+/month) that compete with free alternatives. Sellers in certain categories also face Fiverr\'s "Buyer Request" limitations that effectively force them to use Promoted Gigs to get visibility. When you add the 20% service fee, withdrawal costs, and optional promotional spending, the true cost of selling on Fiverr can exceed 25% of revenue.'
		},
		{
			heading: 'How do you reduce Fiverr fees without leaving the platform?',
			body: "You cannot reduce Fiverr's 20% service fee — it is non-negotiable. However, you can: raise your prices to account for the fee (charge $125 instead of $100 to net $100), use Fiverr's direct payment feature (available in some markets) to bypass fees on repeat clients, minimize Promoted Gigs spending by optimizing your gig SEO, and move some clients to a lower-fee platform like BitTasker. The most effective long-term strategy is to diversify: use Fiverr for discovery, then transition repeat clients to platforms where you keep more earnings."
		}
	],
	faq: [
		{
			question: 'How much does Fiverr take from sellers?',
			answer:
				'Fiverr takes 20% of every order — the highest among major freelance platforms. On a $100 gig, you receive $80. On a $500 project, you receive $400. There is also a $1–$3 withdrawal fee depending on method.'
		},
		{
			question: "Why is Fiverr's fee so high?",
			answer:
				"Fiverr's 20% fee funds its marketplace infrastructure, buyer protection, and marketing. However, it is double Upwork's 10% and four times BitTasker's 5%. Fiverr justifies the fee by providing a built-in buyer marketplace — you do not need to find clients yourself."
		},
		{
			question: "Can I avoid Fiverr's 20% fee?",
			answer:
				'Not on the platform itself — the fee is mandatory. You can reduce the impact by pricing your services to account for it, or by moving repeat clients to a lower-fee platform like BitTasker (5%) or Contra (0%).'
		},
		{
			question: 'How long does Fiverr hold your money?',
			answer:
				'New sellers face a 14-day clearance period after order completion. Established sellers with sufficient order volume get 7 days. After clearance, withdrawal takes 1–5 business days depending on method. BitTasker pays instantly.'
		},
		{
			question: 'What is the cheapest way to withdraw from Fiverr?',
			answer:
				'PayPal withdrawal costs $1–$2 and is the fastest. ACH bank transfer costs $1 but is US-only. Payoneer costs $3 and is best for international sellers. BitTasker offers near-zero withdrawal fees via Lightning.'
		},
		{
			question: 'How much can I realistically earn on Fiverr after fees?',
			answer:
				'You keep about 79.5% of every dollar earned on Fiverr. A seller earning $5,000/month in gross revenue keeps approximately $3,975/month after the 20% fee and withdrawal costs — about $1,025/month goes to Fiverr.'
		},
		{
			question: 'Is Fiverr worth the 20% fee?',
			answer:
				"Fiverr's value is the built-in buyer marketplace — you do not need to find clients. If the volume of buyers and ease of use justifies the fee for you, it can be worth it. For higher margins, combine Fiverr with lower-fee platforms like BitTasker."
		}
	],
	bitTaskerCta: {
		heading: 'Stop Losing 20% on Every Order',
		body: "BitTasker charges just 5% — a quarter of Fiverr's fee. On $5,000/month in earnings, that is $7,440 more in your pocket each year. Plus, payouts are instant via Bitcoin Lightning — no 14-day holds.",
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
