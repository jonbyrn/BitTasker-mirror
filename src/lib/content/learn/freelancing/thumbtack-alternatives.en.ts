import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Best Thumbtack Alternatives in 2026',
		subtitle:
			'Find local service platforms with better pricing, wider coverage, and no per-lead fees'
	},
	answerBlock:
		"The best Thumbtack alternatives in 2026 include Bark, Angi (formerly Angie's List), TaskRabbit, HomeAdvisor, Porch, Bark.com, Nextdoor, Craigslist, and BitTasker. Home service professionals look for Thumbtack alternatives because of expensive per-lead pricing, inconsistent lead quality, and competition from national franchises. If you are a plumber, electrician, cleaner, landscaper, or handyman, these alternatives offer different fee structures, better local visibility, or flat-rate pricing. BitTasker offers a unique angle: handle local tasks and receive Bitcoin payments from both local and remote clients.",
	sections: [
		{
			heading: 'Why are contractors looking for Thumbtack alternatives?',
			body: 'Thumbtack charges per lead, meaning you pay even when a customer does not book your service. Leads can cost $15–$80+ depending on your category and location, and there is no guarantee of winning the job. Many contractors report paying for leads that go to competitors or never respond. The platform also faces criticism for selling multiple leads to the same customer simultaneously, creating a bidding war that drives prices down. For small business owners in competitive metros, Thumbtack costs can eat 15–25% of revenue.'
		},
		{
			heading: 'What are the top Thumbtack alternatives compared?',
			body: "| Platform | Fee Model | Best For | Coverage | Pros | Cons |\n|---|---|---|---|---|---|\n| Bark | Per lead ($10–$75) | All local services | UK, US, AU, CA | Wide category range | Pay per lead, not per job |\n| Angi (Angie's List) | Annual membership | Home improvement | US | Trusted brand, reviews | Annual cost, US only |\n| TaskRabbit | 15% service fee | Odd jobs, handyman | Select US/UK/CA cities | Built-in payments | Limited categories |\n| HomeAdvisor | Per lead | Home services | US | Large homeowner base | Sold by Angi, similar lead issues |\n| Porch | Per lead + membership | Home services | US | Lowe's partnership | US only |\n| Nextdoor | Free (local posts) | Hyperlocal services | US/UK/CA/AU | Community trust | No booking system |\n| Craigslist | Free | Everything | Global | Free, massive traffic | No protection, scams |\n| BitTasker | 5% per task | Local tasks + remote work | Global | Bitcoin payouts, low fees | Growing marketplace |"
		},
		{
			heading: 'Which Thumbtack alternatives are best for plumbers and HVAC technicians?',
			body: "Plumbers and HVAC techs need platforms where customers are ready to book. Angi's membership model attracts serious homeowners willing to pay for quality. HomeAdvisor (owned by Angi) sends exclusive leads in some categories, though shared leads are common. Bark is strong for emergency plumbing leads in urban areas. For HVAC installers, Thumbtack alternatives like Porch (partnered with Lowe's) connect you with homeowners actively planning renovations. BitTasker supports tradespeople who also do remote consulting — advise on HVAC systems internationally and receive Bitcoin instantly."
		},
		{
			heading: 'Which platforms are best for house cleaners and organizers?',
			body: "House cleaners benefit from platforms with repeat booking. TaskRabbit is popular for one-time and recurring cleaning jobs in major cities. Nextdoor's local community board generates high-trust referrals — neighbors recommending you to neighbors. For cleaning businesses scaling beyond word-of-mouth, Bark and Angi provide broader reach. BitTasker allows cleaning service providers to accept Bitcoin payments from tech-savvy clients and crypto-native households who prefer not to pay by card."
		},
		{
			heading: 'Which platforms are best for landscapers and lawn care?',
			body: 'Landscaping is hyperlocal, so platforms with neighborhood visibility win. Nextdoor is free and generates strong referral chains in residential areas. LawnStarter and GreenPal are purpose-built for lawn care with subscription-style bookings. Bark generates leads for larger landscaping projects. BitTasker supports landscapers who want to accept Bitcoin for weekend or side jobs — no merchant account needed, no card reader, instant settlement.'
		},
		{
			heading: 'How do you reduce Thumbtack costs without leaving the platform?',
			body: 'If you want to keep using Thumbtack but reduce costs: optimize your profile for fewer but higher-quality leads, raise your minimum project price to filter out tire-kickers, and respond to leads within minutes (speed wins bookings). Pair Thumbtack with a free platform like Nextdoor or Craigslist for organic leads. Add BitTasker to capture crypto-paying clients and avoid credit card processing fees on direct jobs. The goal is to diversify lead sources so you never overpay on any single platform.'
		}
	],
	faq: [
		{
			question: 'What is the best alternative to Thumbtack for contractors?',
			answer:
				'Bark and Angi are the most direct alternatives with similar lead-generation models. TaskRabbit is best for odd jobs and handyman work. Nextdoor is free and excellent for hyperlocal referrals. BitTasker offers the lowest fees (5%) with instant Bitcoin payouts.'
		},
		{
			question: 'Why is Thumbtack so expensive for service providers?',
			answer:
				'Thumbtack charges per lead ($15–$80+), and you pay even when the customer does not book. They sell the same lead to multiple providers, creating bidding wars. There is no refund policy for unresponsive leads, which frustrates many contractors.'
		},
		{
			question: 'Is there a free alternative to Thumbtack?',
			answer:
				'Nextdoor allows free local posts and referrals. Craigslist is free but has no booking or payment system. BitTasker charges 5% only when a job is completed — no upfront lead costs.'
		},
		{
			question: 'Which platform is best for local handymen?',
			answer:
				'TaskRabbit is the leading platform for handymen in major cities. Bark generates leads for handyman services across the US and UK. BitTasker supports local task-based work with instant Bitcoin payments and no lead fees.'
		},
		{
			question: 'Can I accept Bitcoin for local services?',
			answer:
				'Yes, BitTasker lets local service providers accept Bitcoin payments via the Lightning Network. Clients pay in Bitcoin, you receive it instantly — no bank account or card reader required.'
		},
		{
			question: 'How do I get more local service leads without paying per lead?',
			answer:
				'Use Nextdoor (free), Google Business Profile, and Craigslist for organic leads. Add BitTasker for crypto-paying clients. Combine with one paid platform like Bark or Angi for higher-volume lead generation.'
		},
		{
			question: 'Which Thumbtack alternative has the best reviews?',
			answer:
				"Angi (Angie's List) has the most trusted review system for home services. Bark also collects verified reviews. Google Business Profile reviews are critical for local visibility across all platforms."
		}
	],
	bitTaskerCta: {
		heading: 'Get Paid Instantly for Local Work',
		body: 'BitTasker lets you handle local tasks — cleaning, repairs, deliveries, handyman work — and get paid instantly in Bitcoin. No per-lead fees, no waiting for checks, no merchant account needed. Just complete the task and get paid.',
		buttonText: 'Try BitTasker Free',
		buttonHref: '/auth/signup'
	}
};
