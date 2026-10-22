import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'The BitTasker wallet',
		subtitle: 'A passkey wallet for Bitcoin, USDT on RGB, and Lightning'
	},
	answerBlock:
		'The BitTasker wallet opens with the same passkey you use to sign in. It holds bitcoin and USDT on RGB, and it can pay bitcoin over Lightning. You do not connect another wallet app. BitTasker does not hold the coins. A card or bank purchase buys bitcoin to your own address. The provider takes the card. There is no in-app swap.',
	sections: [
		{
			heading: 'How do I open it?',
			body: 'Sign up with a passkey on this device. There is no password for login. The same passkey opens the wallet. Routine signing can reuse that login for a while. Sending, paying a Lightning invoice, locking escrow, paying an escrow invoice, and exporting the recovery words ask for the passkey again.'
		},
		{
			heading: 'What can it hold?',
			body: 'Bitcoin and USDT on RGB. Lightning in this wallet is for bitcoin. USDT on RGB does not need a Lightning channel. You can receive either into this wallet. You cannot bring in a balance from an old app wallet by using the same words: this wallet is separate.'
		},
		{
			heading: 'How do I add money?',
			body: 'Receive Bitcoin or USDT from someone else, or buy bitcoin with a card or bank transfer. The purchase page is the provider’s. BitTasker does not see your card or identity documents. The bitcoin is paid to your own address. A card purchase cannot deliver USDT on RGB, so that button buys bitcoin.'
		},
		{
			heading: 'How does escrow use the wallet?',
			body: 'Publishing a service does not open the wallet. A listing is just a post. When a hirer accepts a bid, they lock Bitcoin or Lightning in escrow. USDT coming soon. The worker submits the work. The hirer approves it. The worker requests payment. The hirer pays that invoice. That usually takes a few minutes. Nothing is paid on a timer.'
		},
		{
			heading: 'Who can message me?',
			body: 'Direct messages open only after escrow is formed, and only between the hirer and the worker. Until then, use the bid. Reviews open only after the invoice is paid.'
		},
		{
			heading: 'What if I disagree?',
			body: 'Do not pay the invoice. Cancel while the contract is still open and unpaid. There is no outside judge and no automatic refund. A paid invoice is final.'
		}
	],
	faq: [
		{
			question: 'Does BitTasker hold my bitcoin?',
			answer:
				'No. The coins sit in the wallet you open with your passkey. BitTasker cannot spend them. Escrow is locked by the hirer and paid out by the hirer after they approve the work.'
		},
		{
			question: 'Can I use MetaMask, Ledger, or another wallet app?',
			answer:
				'Not for this wallet. Sign-in and payments use the passkey wallet in BitTasker. You do not connect a browser extension.'
		},
		{
			question: 'Can I swap inside the app?',
			answer:
				'No. Receive Bitcoin or USDT, or buy bitcoin with a card or bank transfer. There is no swap between networks.'
		},
		{
			question: 'What is USDT on RGB?',
			answer:
				'It is the dollar balance in this wallet. It stays in this wallet. A card purchase sends bitcoin to your address instead, because that purchase cannot deliver these dollars.'
		},
		{
			question: 'When do I need the passkey again?',
			answer:
				'Login, unlocking the wallet, sending, paying Lightning, locking escrow, paying an escrow invoice, and exporting recovery words.'
		},
		{
			question: 'Can I leave a review before I am paid?',
			answer: 'No. Reviews open only after the escrow invoice is paid.'
		}
	],
	bitTaskerCta: {
		heading: 'Open your wallet with a passkey',
		body: 'Sign up, fund Bitcoin or USDT, and lock escrow when you hire. Pay the invoice after you approve the work.',
		buttonText: 'Create your account',
		buttonHref: '/auth/signup'
	}
};
