import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard vs Trezor: Bitcoin Security Compared',
		subtitle:
			'Open-source transparency meets air-gapped security — which approach protects your Bitcoin better?'
	},
	answerBlock:
		"The Coldcard and Trezor represent two philosophies of Bitcoin security. The Coldcard is a Bitcoin-only, air-gapped hardware wallet that never connects to any networked device — transactions are signed via MicroSD card or QR code. Trezor is a multi-coin wallet that connects via USB and offers full open-source transparency with a touchscreen interface. Both are fully open source. Choose the Coldcard if you want maximum security for long-term Bitcoin storage with zero network exposure. Choose Trezor if you want a user-friendly, multi-coin wallet that's easy to set up and use daily. The Coldcard is the vault; Trezor is the safe you use regularly.",
	sections: [
		{
			heading: 'What makes the Coldcard different from Trezor?',
			body: 'The Coldcard is Bitcoin-only and fully air-gapped. It communicates exclusively through MicroSD cards, NFC, or QR codes — never USB, never Bluetooth, never WiFi. This eliminates every possible data path for remote attacks. Trezor connects via USB (Bluetooth on Safe 3 and Safe 5 models only), which means it physically touches a networked computer during use. The Coldcard uses dual secure elements (Microchip ATECC608 and Maxim DS28C36B) for redundant key protection. Trezor does not use a secure element at all. The Coldcard also offers unique physical security features: duress PINs that load a decoy wallet, brick PINs that permanently destroy the secure element if the device is seized, and a login countdown timer that delays access. Trezor offers standard PIN protection and passphrase support but none of these advanced physical deterrents.'
		},
		{
			heading: 'Which is more secure for Bitcoin cold storage?',
			body: "For pure Bitcoin cold storage, the Coldcard is objectively more secure. Its air-gapped design means your private key never touches a computer, phone, or any networked device — even during setup and transaction signing. The dual secure elements provide two independent layers of cryptographic protection. Features like duress PINs, brick PINs, and login countdowns add physical security that Trezor simply does not offer. Trezor's advantage is full open-source transparency — every line of firmware is publicly auditable. The Coldcard is also fully open source. For most users, the air-gapped design of the Coldcard provides a higher security ceiling than any USB-connected wallet. Trezor remains highly secure for everyday use but sits a step below the Coldcard for long-term cold storage of significant Bitcoin holdings."
		},
		{
			heading: 'How much does each wallet cost?',
			body: "The Coldcard Mk5 costs $149.87 and the Coldcard Q costs $214.87, both from coinkite.com. Trezor offers more price points: Model One ($69), Safe 3 ($79), Model T ($219), and Safe 5 ($169). Trezor's Model One at $69 is the most affordable option for Bitcoin cold storage. The Coldcard's price reflects its dual secure elements and air-gapped architecture. Both require no subscription fees. You will also need a MicroSD card for the Coldcard ($5–10) and a companion wallet like Sparrow Wallet (free, open source) on your computer."
		},
		{
			heading: 'Is Trezor easier to set up than Coldcard?',
			body: "Yes, Trezor is significantly easier to set up for beginners. Plug it in, go to trezor.io/start, follow the on-screen prompts, and you are running in 10 minutes. The touchscreen interface on Model T and Safe 5 makes setup intuitive. The Coldcard requires more technical knowledge: you need to understand PSBTs (Partially Signed Bitcoin Transactions), use a companion wallet like Sparrow Wallet, and manage MicroSD cards for transaction signing. The air-gapped workflow is more secure but has a steeper learning curve. If you are new to Bitcoin hardware wallets, Trezor provides a gentler on-ramp. If you are comfortable with technical workflows and prioritize maximum security, the Coldcard's setup is worth the effort."
		},
		{
			heading: 'Which works better with BitTasker?',
			body: "Both work well with BitTasker for different use cases. The Coldcard is ideal for storing large Bitcoin earnings from BitTasker long-term — pair it with Sparrow Wallet to create unsigned transactions, sign them on the Coldcard, and broadcast them. Trezor works with Trezor Suite for a more integrated experience managing your BitTasker earnings. For Lightning payments on BitTasker, neither hardware wallet supports Lightning directly — use a Lightning-enabled software wallet for daily transactions and keep your hardware wallet for savings. The Coldcard's air-gapped model is particularly well-suited to paranoid freelancers who want zero exposure when managing their earnings."
		}
	],
	faq: [
		{
			question: 'Which is more secure, Coldcard or Trezor?',
			answer:
				'The Coldcard is more secure for long-term Bitcoin storage. Its air-gapped design (no USB, no Bluetooth), dual secure elements, and physical deterrent features (duress PINs, brick PINs) provide a higher security ceiling than any USB-connected wallet like Trezor.'
		},
		{
			question: 'Is Coldcard more expensive than Trezor?',
			answer:
				'The Coldcard Mk5 ($149.87) is more expensive than the Trezor Model One ($69) and Safe 3 ($79) but comparable to the Trezor Model T ($219). The Coldcard Q ($214.87) is similar to the Model T in price.'
		},
		{
			question: 'Can I use both Coldcard and Trezor with BitTasker?',
			answer:
				'Yes. Both generate standard Bitcoin addresses that work with BitTasker. Use Ledger Live or Trezor Suite (Trezor) or Sparrow Wallet (Coldcard) to manage receiving addresses. For Lightning, pair either with a Lightning software wallet.'
		},
		{
			question: 'Is Trezor fully open source?',
			answer:
				'Yes, Trezor is 100% open source — firmware and hardware designs are publicly available. The Coldcard is also fully open source with reproducible firmware builds.'
		},
		{
			question: 'Should beginners buy Coldcard or Trezor?',
			answer:
				'Beginners should start with Trezor. The setup process is straightforward, the touchscreen interface is intuitive, and Trezor Suite guides you through every step. The Coldcard requires understanding PSBTs and air-gapped workflows, which has a steeper learning curve.'
		},
		{
			question: 'Where should I buy a Coldcard or Trezor?',
			answer:
				'Buy directly from coinkite.com (Coldcard) or trezor.io (Trezor). Never purchase hardware wallets from Amazon, eBay, or third-party resellers, as devices may have been tampered with.'
		}
	],
	bitTaskerCta: {
		heading: 'Secure Your Bitcoin Freelance Earnings',
		body: 'Earn on BitTasker, store on Coldcard or Trezor. The Coldcard is your vault for long-term savings; Trezor is your daily-use cold storage. Both keep your Bitcoin offline.',
		buttonText: 'Start Earning',
		buttonHref: '/auth/signup'
	},
	product: [
		{
			name: 'Coldcard Mk5',
			description:
				'Bitcoin-only air-gapped signing device with dual secure elements. Top choice for security-focused Bitcoiners.',
			brand: 'Coinkite',
			image: '/images/wallets/coldcard.png',
			url: 'https://coldcard.com/',
			offers: {
				price: '150',
				priceCurrency: 'USD',
				availability: 'https://schema.org/InStock',
				url: 'https://coldcard.com/'
			},
			review: {
				reviewRating: {
					ratingValue: '4.8',
					bestRating: '5'
				},
				author: {
					'@type': 'Organization',
					name: 'BitTasker'
				},
				reviewBody:
					'Bitcoin-only air-gapped signing device with dual secure elements. Top choice for security-focused Bitcoiners.'
			}
		},
		{
			name: 'Trezor Model T',
			description:
				'Fully open-source hardware wallet with color touchscreen, microSD slot, and no secure element. Maximum transparency for Bitcoin purists.',
			brand: 'Trezor',
			image: '/images/wallets/trezor-model-t.png',
			url: 'https://trezor.io/',
			offers: {
				price: '219',
				priceCurrency: 'USD',
				availability: 'https://schema.org/InStock',
				url: 'https://trezor.io/'
			},
			review: {
				reviewRating: {
					ratingValue: '4.4',
					bestRating: '5'
				},
				author: {
					'@type': 'Organization',
					name: 'BitTasker'
				},
				reviewBody:
					'Fully open-source hardware wallet with color touchscreen, microSD slot, and no secure element. Maximum transparency for Bitcoin purists.'
			}
		}
	]
};
