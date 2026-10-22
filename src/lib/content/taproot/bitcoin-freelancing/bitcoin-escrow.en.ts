import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'How escrow works on BitTasker',
		subtitle:
			'The hirer locks Bitcoin or Lightning. USDT coming soon. They pay your invoice after they approve the work.'
	},
	answerBlock:
		'Escrow on BitTasker keeps the agreed amount in the wallet flow until the work is approved. The hirer locks Bitcoin or a Lightning payment. USDT coming soon. The worker submits the work. The hirer approves it. The worker requests payment. The hirer pays that invoice, which usually takes a few minutes. BitTasker cannot spend the locked amount. Nothing is paid on a timer, and there is no outside judge. Direct messages open only after escrow is formed. Reviews open only after the invoice is paid.',
	sections: [
		{
			heading: 'How does a job get paid?',
			body: 'Sign up with a passkey on this device. The same passkey opens your wallet. Post a task or send a bid. When the hirer accepts, they lock the agreed amount in escrow. You do the work and submit it. They approve it. You request payment. They pay that invoice from the same wallet. You can fund the wallet by receiving Bitcoin or USDT, or by buying bitcoin with a card or bank transfer. The card provider takes the payment. The bitcoin is paid to your own address. BitTasker does not see the card.'
		},
		{
			heading: 'What is locked, and who can move it?',
			body: 'The hirer locks Bitcoin or Lightning. USDT coming soon. BitTasker does not hold that money and cannot pay it out. The hirer pays the worker’s invoice only after approving the work. A paid invoice is final. If you disagree before that payment, cancel while the contract is still open and unpaid. Cancelling does not by itself send a refund.'
		},
		{
			heading: 'When can you message each other?',
			body: 'Use the bid to agree the work. Direct messages open only after escrow is formed, and only between the hirer and the worker. Phone numbers, email addresses, and outside links in a bid are blocked. That keeps the agreement on the record before anyone is paid.'
		},
		{
			heading: 'What if you disagree?',
			body: 'Do not pay the invoice if the work is not acceptable. Either side can cancel while the contract is still open and unpaid. There is no 7-day automatic payout and no 14-day automatic refund. BitTasker does not decide a split. Talk in the bid before escrow, or in messages after escrow is formed.'
		},
		{
			heading: 'When can you leave a review?',
			body: 'A review opens only after the escrow is paid. The hirer or the worker can leave a star rating then. A review is not available while the contract is still unpaid.'
		},
		{
			heading: 'How is this different from paying someone directly?',
			body: 'Paying someone directly sends the money immediately. Escrow holds it until you approve the work and pay the invoice. You still use your own wallet. You still approve with your passkey for the lock and for the payment.'
		}
	],
	faq: [
		{
			question: 'Does BitTasker hold the money?',
			answer:
				'No. The hirer locks it from the wallet they open with their passkey. BitTasker cannot spend it.'
		},
		{
			question: 'What if the hirer never approves?',
			answer:
				'Nothing is paid on a timer. They should not pay the invoice. Either side can cancel while the contract is still open and unpaid.'
		},
		{
			question: 'Can I pay with a card?',
			answer:
				'You can buy bitcoin with a card or bank transfer. The provider handles the card. The bitcoin is paid to your own address. The escrow itself is Bitcoin or Lightning. USDT coming soon.'
		},
		{
			question: 'Do I connect MetaMask or another wallet?',
			answer:
				'No. You sign up with a passkey and open the BitTasker wallet with that passkey. There is no in-app swap and no separate network to connect.'
		},
		{
			question: 'Which currencies can escrow use?',
			answer: 'Bitcoin or Lightning. USDT coming soon. Lightning in this wallet is for bitcoin.'
		},
		{
			question: 'When do reviews and messages open?',
			answer: 'Messages open once escrow is formed. Reviews open after the invoice is paid.'
		}
	],
	bitTaskerCta: {
		heading: 'Lock the payment, then do the work',
		body: 'Sign up with a passkey. Open your wallet. Post a task or send a bid. Escrow holds the amount until the hirer approves the work and pays the invoice.',
		buttonText: 'Create your account',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How escrow works on BitTasker',
		description:
			'From passkey signup to locking escrow, delivery, approval, and paying the invoice.',
		totalTime: 'PT10M',
		steps: [
			{
				name: 'Sign up with a passkey',
				text: 'Create an account on this device with a passkey. The same passkey opens your wallet.'
			},
			{
				name: 'Fund the wallet',
				text: 'Receive Bitcoin or USDT, or buy bitcoin with a card or bank transfer. Card purchases are paid to your own address.'
			},
			{
				name: 'Agree the job',
				text: 'Post a task or send a bid. Use the bid to describe the work. Messages stay closed until escrow is formed.'
			},
			{
				name: 'Lock escrow',
				text: 'The hirer locks Bitcoin or Lightning. USDT coming soon. BitTasker cannot spend it.'
			},
			{
				name: 'Deliver, approve, and pay',
				text: 'The worker submits the work. The hirer approves it and pays the invoice. Reviews open after that payment.'
			}
		]
	}
};
