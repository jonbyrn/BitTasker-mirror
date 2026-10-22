import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Crypto Payroll: Pay Employees and Contractors in Bitcoin',
		subtitle:
			'Lower fees, faster settlement, and global reach. How businesses use Bitcoin payroll for remote teams.'
	},
	answerBlock:
		'Crypto payroll is the practice of paying employees and contractors in Bitcoin or other cryptocurrencies instead of traditional fiat currencies. Businesses use crypto payroll to reduce international wire transfer fees (typically $25–$50 per transaction), eliminate 3–5 day settlement delays, and access a global talent pool without geographic banking restrictions. For gig workers and freelancers, crypto payroll means instant payment via the Lightning Network — no more Net-14 holds or bank processing delays. BitTasker enables businesses to pay freelancers instantly in Bitcoin through integrated Lightning payments, with lower platform fees than traditional payroll services.',
	sections: [
		{
			heading: 'How does crypto payroll work for businesses?',
			body: "Crypto payroll operates by converting a portion or all of an employee's compensation into Bitcoin or stablecoins before disbursement. The business can hold Bitcoin on its balance sheet and pay employees directly in BTC, or use a payroll service that handles the conversion. For freelancers and contractors, platforms like BitTasker manage the process end-to-end: the client deposits Bitcoin into escrow, work is completed and verified, and payment is released instantly via the Lightning Network. There is no need for traditional banking infrastructure — just a Bitcoin wallet on both sides."
		},
		{
			heading: 'How does Bitcoin payroll compare to traditional payroll?',
			body: "Traditional payroll involves multiple intermediaries: the employer's bank, correspondent banks, the employee's bank, and currency exchange services. Each intermediary charges fees and adds processing time. International wire transfers typically cost $25–$50 and take 3–5 business days. Crypto payroll eliminates most intermediaries. Bitcoin payments via Lightning Network cost less than $0.01 and settle in seconds. For a company paying 20 international contractors monthly, switching to crypto payroll can save $500–$1,000 in wire transfer fees alone, while contractors receive payment instantly instead of waiting days."
		},
		{
			heading: 'What are the benefits of crypto payroll for global teams?',
			body: "Crypto payroll solves three persistent problems for businesses with distributed teams. First, geographic access: any contractor with a Bitcoin wallet can receive payment, regardless of which country they're in or which banks they have access to. This is critical in Latin America, Africa, and Southeast Asia where traditional banking access is limited. Second, speed: Lightning payments arrive in seconds, not days. Third, cost: eliminating wire transfer fees and currency conversion charges reduces payroll overhead significantly. For businesses hiring in countries like El Salvador (where Bitcoin is legal tender), Argentina, Nigeria, or the Philippines, crypto payroll is often the most practical payment method."
		},
		{
			heading: 'What compliance considerations apply to crypto payroll?',
			body: 'Paying employees in Bitcoin has tax and reporting implications that vary by jurisdiction. In most countries, Bitcoin payments are treated as ordinary income and must be reported at fair market value at the time of payment. Employers may need to handle income tax withholding, social security contributions, and reporting obligations in Bitcoin. The US, EU, and most Latin American countries have frameworks for reporting crypto compensation. El Salvador provides special provisions since Bitcoin is legal tender. This article offers general information — consult a qualified accountant or tax advisor for compliance requirements specific to your business and employee locations.'
		},
		{
			heading: 'What tools and platforms support crypto payroll?',
			body: 'Several tools facilitate crypto payroll for businesses. Bitwage lets businesses convert any salary to Bitcoin and send it to employee wallets. Strike offers Bitcoin payroll APIs for businesses. BitTasker is purpose-built for paying freelancers and contractors in Bitcoin, with integrated escrow and instant Lightning payouts. For stablecoin payroll (paying in USDT or USDC instead of BTC), platforms like Request Network and Deel support crypto disbursements. The right tool depends on whether you need Bitcoin-native payments (BitTasker, Bitwage) or stablecoin-denominated payroll (Deel, Request).'
		},
		{
			heading: 'How do gig workers benefit from crypto payroll?',
			body: "Freelancers and gig workers benefit from crypto payroll in several ways. Instant payment: no more waiting 14 days or more for earnings to clear. Lower platform fees: BitTasker charges 5–10% compared to Upwork's 20%, meaning workers keep more of their earnings. Financial access: workers in unbanked or underbanked regions can receive payment with just a smartphone and a Bitcoin wallet. Savings opportunity: receiving payment in Bitcoin allows workers to build savings in an asset that historically appreciates over time. Portable identity: combined with Nostr-based identity on BitTasker, crypto payroll creates a fully decentralized work experience."
		},
		{
			heading: 'Is crypto payroll the future of remote work?',
			body: 'Crypto payroll is gaining traction as remote work becomes the norm and businesses hire across borders. The combination of instant settlement, near-zero transaction fees, and open access makes Bitcoin payments a natural fit for the global gig economy. In Latin America, where remittance fees average 5–7% and banking access varies widely, crypto payroll offers a direct improvement over traditional payment rails. As Lightning Network adoption grows and wallet UX improves, crypto payroll will become increasingly mainstream for businesses of all sizes.'
		}
	],
	faq: [
		{
			question: 'Is it legal to pay employees in Bitcoin?',
			answer:
				'In most jurisdictions, yes — with proper tax reporting. Bitcoin can be used for compensation, but employers must report the value as ordinary income and handle applicable taxes. El Salvador has made Bitcoin legal tender, simplifying crypto payroll there. Consult a tax professional for your specific jurisdiction.'
		},
		{
			question: 'How do employees convert Bitcoin to their local currency?',
			answer:
				'Employees can use exchanges (Coinbase, Binance), peer-to-peer platforms (Bisq), or Lightning-compatible services (Strike, Relai) to convert Bitcoin to their local currency. The conversion process takes minutes to hours depending on the service and bank processing times.'
		},
		{
			question: 'What if the employee prefers to be paid in fiat?',
			answer:
				'Many businesses offer crypto payroll as an option rather than a requirement. Employees can choose between traditional bank transfers and Bitcoin payments. Services like Bitwage let employees specify what percentage of their salary to receive in Bitcoin.'
		},
		{
			question: 'Does crypto payroll save money compared to traditional payroll?',
			answer:
				'Yes, especially for international payments. Traditional wire transfers cost $25–$50 and take 3–5 days. Lightning Network payments cost less than $0.01 and settle in seconds. For businesses with many international contractors, the savings on wire fees alone can be significant.'
		},
		{
			question: 'How does BitTasker handle crypto payroll for freelancers?',
			answer:
				'On BitTasker, the hirer locks Bitcoin or Lightning in the passkey wallet, then pays the invoice after approving the work. USDT coming soon. Messages open after escrow is formed. Reviews open after that payment.'
		},
		{
			question: 'What about Bitcoin price volatility for payroll?',
			answer:
				'Businesses and employees can manage volatility by converting to stablecoins or fiat immediately after payment. Some businesses use dollar-cost averaging to buy Bitcoin gradually for payroll, reducing the impact of price swings. Employees can choose to hold, convert, or split their Bitcoin compensation as they prefer.'
		}
	],
	bitTaskerCta: {
		heading: 'Pay your freelance team in Bitcoin — instantly',
		body: 'BitTasker makes crypto payroll simple for businesses. Deposit Bitcoin, approve work, and your contractors get paid instantly via Lightning. Lower fees than traditional platforms, faster than wire transfers.',
		buttonText: 'Set Up Bitcoin Payroll',
		buttonHref: '/auth/signup'
	}
};
