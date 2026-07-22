import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker vs Upwork: Bitcoin Freelancing Compared',
		subtitle:
			'See how BitTasker stacks up against Upwork on fees, payment speed, identity, and freelancer freedom.'
	},
	answerBlock:
		"BitTasker is a Bitcoin-native freelancing platform that charges tiered fees as low as 5% — compared to Upwork's flat 10% service fee. Payments settle instantly via the Lightning Network instead of Upwork's Net-14 payout cycle. Freelancers own their identity through Nostr protocols rather than trusting a centralized platform that can freeze accounts or withhold funds. If you want faster payouts, lower costs, and censorship-resistant work, BitTasker is the stronger choice for Bitcoin-era freelancing.",
	sections: [
		{
			heading: 'How do BitTasker and Upwork fees compare?',
			body: 'Upwork charges a flat 10% service fee on every invoice — the same rate whether you earn $500 or $50,000 per month. BitTasker uses a tiered fee structure that rewards loyalty: new users start around 10%, and long-term freelancers with strong completion rates can drop to 5% or lower. On a $1,000 project, you keep $950 on BitTasker versus $800 on Upwork. That $150 difference compounds quickly over months of steady work.'
		},
		{
			heading: 'What is the payment speed difference?',
			body: 'Upwork holds completed payments for a mandatory 14-day clearance period (Net-14) before funds reach your bank — and then your bank adds another 1–3 business days. Total time from delivery to cash in hand: 15–17 days minimum. BitTasker settles payments instantly through the Lightning Network. The moment a client confirms delivery, satoshis arrive in your wallet. No holding periods, no bank delays, no intermediary touching your money.'
		},
		{
			heading: 'How does identity and account security compare?',
			body: 'On Upwork, your reputation, portfolio, and client relationships are locked to a centralized account. Upwork can suspend or ban your account at any time — and you lose everything: years of reviews, proposal history, and client connections. BitTasker uses Nostr-based decentralized identity. Your reputation is portable and censorship-resistant. No central authority can erase your work history or freeze your earnings. You own your identity the way you own your Bitcoin.'
		},
		{
			heading: 'What about escrow and payment protection?',
			body: "Both platforms offer escrow to protect freelancers and clients. Upwork's escrow is fully controlled by their internal systems — disputes go through their support team, and resolution times can stretch for weeks. BitTasker uses smart contracts on Rootstock (a Bitcoin sidechain) for escrow. Funds are locked in auditable smart contracts, and dispute resolution follows transparent on-chain rules. You don't have to trust a company — you trust code."
		},
		{
			heading: 'What does the BitTasker vs Upwork comparison table show?',
			body: '| Feature | BitTasker | Upwork |\n| --- | --- | --- |\n| Service fee | 5–10% (tiered) | 10% flat |\n| Payout speed | Instant (Lightning) | Net-14 + bank transfer |\n| Identity | Nostr (decentralized) | Centralized account |\n| Escrow | Rootstock smart contracts | Internal systems |\n| Account portability | Full — you own your data | Locked to platform |\n| Crypto payments | Native BTC + Lightning | Not supported |\n| Geographic restrictions | Global, open access | Restricted in some countries |'
		},
		{
			heading: 'When is Upwork the better choice?',
			body: "Upwork still has advantages in certain scenarios. If you need access to its massive enterprise client base (companies like Microsoft, Airbnb, and Automattic post jobs there), Upwork's reach is unmatched. If you prefer receiving payments in fiat to a traditional bank account without managing a Bitcoin wallet, Upwork's pipeline is simpler. If you're already established on Upwork with a high Job Success Score and a strong portfolio, switching costs may outweigh the benefits of lower fees."
		},
		{
			heading: 'When is BitTasker the better choice?',
			body: "BitTasker is best for freelancers who want to keep more of their earnings, get paid instantly, and own their professional identity. It's ideal for remote workers in Latin America, Africa, and Southeast Asia who face banking friction and high remittance fees. It's built for developers, designers, writers, and translators comfortable with Bitcoin wallets. And it's the right choice for anyone who values censorship resistance — freelancers who've been deplatformed, or who work in industries where centralized platforms impose arbitrary restrictions."
		}
	],
	faq: [
		{
			question: 'Is BitTasker really cheaper than Upwork?',
			answer:
				"Yes. BitTasker's tiered fees range from 5–10%, compared to Upwork's flat 10%. On a $2,000 project, you save $200–$300 per job. Over a year of steady freelancing, that can mean thousands of dollars more in your pocket."
		},
		{
			question: 'How do I receive Bitcoin payments from BitTasker?',
			answer:
				'BitTasker pays via the Lightning Network — the fastest, cheapest layer for Bitcoin transactions. You need a Lightning-compatible wallet (like Aqua, Blink, or Wallet of Satoshi). Payments arrive instantly when the client confirms delivery.'
		},
		{
			question: 'Can I use BitTasker and Upwork at the same time?',
			answer:
				'Absolutely. Many freelancers use both platforms simultaneously. Start by testing BitTasker with a few projects to build your reputation there while maintaining your Upwork income stream.'
		},
		{
			question: 'What happens if there is a dispute on BitTasker?',
			answer:
				"BitTasker uses Rootstock smart contracts for escrow. If a dispute arises, both parties present evidence and the resolution follows transparent on-chain rules. Funds are never held by BitTasker — they're locked in the smart contract until both parties agree or a resolution is reached."
		},
		{
			question: 'Is my Upwork reputation transferable to BitTasker?',
			answer:
				'Not directly — Upwork reviews are siloed on their platform. However, you can reference your Upwork portfolio when setting up your BitTasker profile. Over time, your Nostr-based reputation on BitTasker becomes your portable, censorship-resistant credential.'
		},
		{
			question: 'Do I need to know about Bitcoin to use BitTasker?',
			answer:
				'You need basic familiarity with Bitcoin wallets and the Lightning Network. Setting up a wallet takes about 10 minutes, and receiving Lightning payments is as simple as sharing an invoice. BitTasker provides guides to get you started.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelance smarter with lower fees and instant payouts',
		body: "BitTasker gives you what Upwork can't: fees that decrease with loyalty, payments that arrive in seconds, and an identity you actually own. Join the growing community of freelancers choosing Bitcoin-native work.",
		buttonText: 'Create Your Free Account',
		buttonHref: '/auth/signup'
	}
};
