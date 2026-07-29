import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Contractor Guide: Taxes & 1099 Reporting',
		subtitle:
			'How to report Bitcoin income, file estimated taxes, and keep records as a 1099 crypto contractor.'
	},
	answerBlock:
		'As a 1099 contractor earning Bitcoin, you must report all crypto income at its fair market value when received. The IRS treats Bitcoin as property, not currency, meaning each payment is a taxable event. You owe income tax on the USD value of Bitcoin at the moment you receive it, and potential capital gains tax if you later sell at a profit. You are responsible for estimated quarterly tax payments, accurate record-keeping of every transaction, and proper 1099 reporting. This guide covers US-focused tax obligations for crypto freelancers — but it is general information, not tax advice. Always consult a qualified tax professional for guidance specific to your situation.',
	sections: [
		{
			heading: 'How do I report Bitcoin income on my taxes?',
			body: 'Bitcoin received as payment for services is treated as ordinary income by the IRS. Report it on Schedule C (Form 1040) if you are a sole proprietor, or Schedule E if operating as an LLC or partnership. The amount you report is the fair market value of the Bitcoin in USD on the date you received it. If Bitcoin was trading at $60,000 when you received 0.01 BTC for a project, you report $600 as income. You do not report Bitcoin price appreciation until you actually sell or spend the Bitcoin — at that point, you owe capital gains tax on the difference between the sale price and the value when you received it. Short-term gains (held less than one year) are taxed as ordinary income. Long-term gains (held over one year) receive preferential rates of 0–20% depending on your income bracket.'
		},
		{
			heading: 'How do I report 1099 income from Bitcoin platforms?',
			body: 'Platforms like BitTasker may issue a 1099-NEC if you earn over $600 in a calendar year. However, the 1099 may only reflect fiat-denominated transactions — not all Bitcoin payments. You are responsible for reporting ALL income, including Bitcoin payments received outside the platform or on platforms that do not issue 1099s. If a client pays you directly in Bitcoin (not through a platform), there is no 1099 issued, but you must still report the income. The IRS matches 1099s against your tax return, so discrepancies trigger audits. Keep your own records as the primary source of truth, not platform-generated reports.'
		},
		{
			heading: 'What records should I keep as a crypto freelancer?',
			body: 'Maintain detailed records of every Bitcoin transaction: date received, amount in BTC, USD value at receipt, client name or project reference, and wallet address. Use a crypto tax tool like Koinly, CoinTracker, or TokenTax to automatically import blockchain transactions and calculate cost basis. Export transaction histories from BitTasker and any exchanges regularly. Keep records for at least seven years — the IRS can audit returns up to three years back, or six years if income is substantially underreported. Store records in multiple locations: cloud backup, local drive, and a physical copy for critical documents. Good records save thousands in accounting fees and protect you in an audit.'
		},
		{
			heading: 'How do estimated quarterly tax payments work?',
			body: 'As a 1099 contractor, you are not subject to employer withholding. You must make estimated quarterly tax payments to the IRS (and your state) using Form 1040-ES. The due dates are April 15, June 15, September 15, and January 15 of the following year. Estimate your annual income, calculate the expected tax liability, and divide by four. For crypto income, use the USD value at the time each payment was received. If you underpay, you may owe penalties. If you overpay, you get a refund. Many crypto freelancers set aside 25–30% of each Bitcoin payment for taxes. Paying in Bitcoin does not eliminate your tax obligation — you owe taxes in USD regardless of how you are paid.'
		},
		{
			heading: 'What international tax considerations apply to Bitcoin freelancers?',
			body: 'Tax obligations vary significantly by country. In the US, Bitcoin income is taxable as ordinary income. In El Salvador, Bitcoin is legal tender and the government has issued specific guidance on crypto taxation. In the EU, VAT treatment of crypto varies by member state — some treat it like foreign currency, others like property. In the UK, HMRC treats crypto as capital assets with specific reporting requirements. Many Latin American countries (Mexico, Argentina, Brazil) have evolving crypto tax frameworks. Some countries have no specific crypto tax laws, creating ambiguity. Regardless of your country, receiving Bitcoin as payment is almost certainly a taxable event. A tax professional in your jurisdiction is essential for compliance.'
		},
		{
			heading: 'How does self-employment tax work for Bitcoin freelancers?',
			body: 'In the US, self-employment tax is 15.3% on net self-employment income (12.4% Social Security up to the wage base, plus 2.9% Medicare). This is in addition to income tax. As a Bitcoin freelancer, your entire net income — calculated in USD at the time of receipt — is subject to self-employment tax. You can deduct half of the self-employment tax as an adjustment to income. Business expenses (hardware, software, home office, internet) are deductible on Schedule C and reduce your net income. For freelancers earning significant Bitcoin income, the self-employment tax is often the largest single tax obligation. Consult a tax professional to optimize your deductions and estimated payments.'
		},
		{
			heading: 'Can I pay taxes in Bitcoin?',
			body: 'Generally, no — the IRS requires tax payments in USD. You must convert enough Bitcoin to dollars to cover your tax liability. Some states accept cryptocurrency for certain taxes, but federal tax payments must be made in USD. This means you need a conversion strategy: sell enough Bitcoin before each estimated payment deadline to cover your liability. Many freelancers maintain a separate "tax" wallet where they accumulate BTC specifically for tax payments, converting to USD before each quarterly deadline. Failing to convert creates a liquidity risk — if Bitcoin drops in value before you can sell for taxes, you still owe the full USD amount.'
		}
	],
	faq: [
		{
			question: 'Do I have to pay taxes on Bitcoin I receive for freelance work?',
			answer:
				'Yes. The IRS treats Bitcoin received as payment as ordinary income at its fair market value on the date of receipt. You must report it on your tax return regardless of whether you convert it to USD or hold it as Bitcoin.'
		},
		{
			question: "What if I don't report my Bitcoin income?",
			answer:
				'The IRS increasingly monitors crypto transactions. Blockchain analysis firms provide data to the IRS, and exchanges issue 1099s. Failure to report income can result in penalties, interest, and criminal prosecution for willful tax evasion. Voluntary disclosure is available if you have unreported income.'
		},
		{
			question: 'How do I calculate the USD value of Bitcoin I received?',
			answer:
				'Use the fair market value on the date and time you received the Bitcoin. Most crypto tax tools (Koinly, CoinTracker) pull historical price data automatically from exchanges. If you received Bitcoin through Lightning, the value is the USD price at the moment of payment.'
		},
		{
			question: 'Do I owe capital gains tax when I sell Bitcoin I earned?',
			answer:
				'Yes. When you sell Bitcoin you received as income, you owe capital gains tax on the difference between the sale price and the value when you received it. If held for less than one year, it is short-term capital gains (taxed as ordinary income). Over one year, long-term capital gains rates apply (0–20%).'
		},
		{
			question: 'Can I deduct my Bitcoin transaction fees as business expenses?',
			answer:
				'Yes. Lightning network fees, on-chain transaction fees, exchange conversion fees, and platform fees paid in the course of earning income are deductible business expenses on Schedule C. Keep records of all fees paid.'
		},
		{
			question: 'Should I use a crypto tax software?',
			answer:
				'Strongly recommended. Tools like Koinly, CoinTracker, and TokenTax automatically import blockchain transactions, calculate cost basis, and generate tax reports. Manual tracking of dozens or hundreds of crypto transactions is error-prone and time-consuming.'
		},
		{
			question: 'What is the IRS stance on Bitcoin as money?',
			answer:
				'The IRS classifies Bitcoin as property, not currency. This means it is subject to property tax rules: income tax when received as payment, and capital gains tax when sold or exchanged. It is not treated like foreign currency for tax purposes.'
		}
	],
	bitTaskerCta: {
		heading: 'Earn Bitcoin — Know Your Tax Obligations',
		body: 'BitTasker makes it easy to earn in Bitcoin, but your tax obligations remain. Keep records of every payment. Consult a tax professional. And start freelancing on the decentralized economy.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
