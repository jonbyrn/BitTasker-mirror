import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Upwork Fees Explained: What You Really Pay',
		subtitle:
			"Complete breakdown of Upwork's service fees, connect costs, and withdrawal fees — with real earnings calculations"
	},
	answerBlock:
		'Upwork charges freelancers a flat 10% service fee on all earnings, with no threshold or tier reduction. You also pay $0.15 per connect to submit proposals, and withdrawal fees range from $0 to $30 depending on your method. On a $1,000 project, you keep approximately $897 after service fees and typical withdrawal costs. That means Upwork takes roughly 10.3% of your total earnings. For comparison, BitTasker charges just 5% with instant Bitcoin payouts — you would keep $950 on the same project.',
	sections: [
		{
			heading: "How does Upwork's service fee work?",
			body: 'Upwork charges a flat 10% service fee on every payment you receive. There is no volume discount, no tier system, and no threshold where the fee drops. Previously, Upwork used a sliding scale (20% for the first $500, 10% for $500–$10,000, 5% above $10,000), but they eliminated this in 2023 in favor of a flat 10%. This means whether you earn $100 or $100,000 on the platform, Upwork takes the same percentage. The fee is deducted before you receive payment — you never see the full amount in your earnings.'
		},
		{
			heading: 'How much do Upwork connects cost and why do they matter?',
			body: 'To submit proposals on Upwork, you need connects — virtual tokens that cost $0.15 each. Each proposal requires 2–6 connects depending on the project. If you submit 50 proposals per month at an average of 3 connects each, that is $22.50 in connect costs before you land a single job. Upwork gives you 80 free connects per month (reduced from 100 in 2024), but active freelancers quickly burn through these. Connects are non-refundable — if your proposal is not accepted, you lose them. This creates a pay-to-play dynamic that penalizes freelancers who need to bid frequently.'
		},
		{
			heading: "What are Upwork's withdrawal fees by method?",
			body: '| Withdrawal Method | Fee | Speed | Notes |\n|---|---|---|---|\n| Direct Deposit (ACH) | $0 | 2–5 business days | US only, best value |\n| Wire Transfer | $30 | 1–3 business days | International, expensive |\n| PayPal | $2 | Instant to minutes | Widely available |\n| Payoneer | $2 | 2–5 business days | Good for international |\n| BitTasker (Bitcoin) | Near-zero | Instant | Via Lightning Network |\n\nDirect deposit is free but limited to US bank accounts. International freelancers face $2–$30 per withdrawal, which adds up significantly over a year. An international freelancer withdrawing $2,000/month via Payoneer pays $24/year in withdrawal fees alone.'
		},
		{
			heading: 'How much do you actually keep after Upwork fees?',
			body: "Let's calculate your real take-home on common project amounts.\n\n$250 project: Service fee $25, connects ~$0.45, withdrawal ~$2. You keep: $222.55 (89%)\n$500 project: Service fee $50, connects ~$0.90, withdrawal ~$2. You keep: $447.10 (89.4%)\n$1,000 project: Service fee $100, connects ~$0.90, withdrawal ~$2. You keep: $897.10 (89.7%)\n$5,000 project: Service fee $500, connects ~$1.80, withdrawal ~$2. You keep: $4,496.20 (89.9%)\n\nOn a $50/hour, 40-hour week, your annual earnings of $104,000 become approximately $93,400 after Upwork fees and typical withdrawal costs — a loss of $10,600 per year."
		},
		{
			heading: 'How do Upwork fees compare to alternatives?',
			body: '| Platform | Service Fee | Connect Cost | Withdrawal Fee | Total on $1,000 |\n|---|---|---|---|---|\n| Upwork | 10% | $0.15/proposal | $0–$30 | $897–$870 |\n| Fiverr | 20% | Free | $1–$3 | $797–$795 |\n| Freelancer.com | 10% or $5 min | Free (limited) | $0–$30 | $895–$865 |\n| Guru | 5–9% | Free | $0–$2 | $948–$909 |\n| BitTasker | 5% | Free | Near-zero | $950 |\n| Contra | 0% | N/A | Free | $1,000 |\n\nBitTasker saves you $53 per $1,000 earned compared to Upwork. Over a year of $8,000/month earnings, that is $5,088 kept in your pocket.'
		},
		{
			heading: 'What is the true cost of Upwork for different freelancer types?',
			body: 'High-earning developers ($100+/hour): The 10% fee is painful but manageable for the quality of clients. Connects are a minor cost relative to earnings.\nMid-tier designers ($30–$60/hour): Connect costs add up fast when competing in crowded design categories. Consider Fiverr or BitTasker.\nNew freelancers ($10–$25/hour): Connect costs and the 10% fee make it hard to build momentum. Freelancer.com or BitTasker offer lower barriers.\nWriters ($25–$75/hour): Upwork is competitive but the 10% fee eats into already-tight margins. Contently or direct clients are more profitable.'
		},
		{
			heading: 'How do you minimize Upwork fees?',
			body: "Build long-term client relationships to reduce proposal volume (and connect spending). Once you have recurring clients, you spend fewer connects per dollar earned. Negotiate milestone structures that front-load payment to reduce the time your money is held. Upgrade to Upwork's Freelancer Plus plan ($14.99/month) for 80 connects and additional features — worth it if you submit 30+ proposals per month. Ultimately, the best way to reduce fees is to diversify to platforms like BitTasker (5% fee) or Contra (0% fee) for a portion of your work."
		}
	],
	faq: [
		{
			question: 'How much does Upwork charge freelancers?',
			answer:
				'Upwork charges a flat 10% service fee on all earnings, plus $0.15 per connect for proposals. Withdrawal fees range from $0 (US direct deposit) to $30 (international wire). On a $1,000 project, you typically keep about $897.'
		},
		{
			question: 'Did Upwork change its fee structure in 2026?',
			answer:
				'Upwork switched to a flat 10% fee in 2023, eliminating the previous sliding scale. As of 2026, the 10% flat fee remains. There is no volume discount or threshold reduction.'
		},
		{
			question: 'What are Upwork connects and how much do they cost?',
			answer:
				'Connects are virtual tokens required to submit proposals. They cost $0.15 each, and each proposal requires 2–6 connects. You receive 80 free connects per month. Non-refundable if your proposal is not accepted.'
		},
		{
			question: 'What is the cheapest way to withdraw from Upwork?',
			answer:
				'US direct deposit (ACH) is free. For international freelancers, Payoneer ($2) is the cheapest option. Wire transfers cost $30. BitTasker offers near-zero withdrawal fees via Bitcoin Lightning.'
		},
		{
			question: 'Is Upwork worth the 10% fee?',
			answer:
				"For high-earning freelancers with established profiles, Upwork's 10% fee is justified by client quality and escrow protection. For newer freelancers, the fees plus connect costs make it harder to build momentum. Consider BitTasker (5%) or Contra (0%)."
		},
		{
			question: 'How can I pay less in Upwork fees?',
			answer:
				'Build recurring client relationships to reduce connect spending. Upgrade to Freelancer Plus ($14.99/mo) if submitting 30+ proposals monthly. Diversify to lower-fee platforms like BitTasker (5%) or Contra (0%) for some work.'
		},
		{
			question: 'Does Upwork take fees from clients too?',
			answer:
				"Yes, clients pay a 3–5% marketplace fee on payments. This is separate from the freelancer's 10% fee, meaning both parties pay Upwork for every transaction."
		}
	],
	bitTaskerCta: {
		heading: 'Keep $53 More Per $1,000 Earned',
		body: "BitTasker's 5% fee means you keep $950 on a $1,000 project — $53 more than Upwork. With instant Bitcoin payouts via Lightning, you also eliminate withdrawal fees and waiting periods. No connects, no hidden costs.",
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
