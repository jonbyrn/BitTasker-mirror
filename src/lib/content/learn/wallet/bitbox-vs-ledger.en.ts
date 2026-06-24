import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitBox02 vs Ledger: Which Hardware Wallet Wins?',
		subtitle:
			'Swiss engineering meets French innovation — a detailed comparison of two premium hardware wallets'
	},
	answerBlock:
		'The BitBox02 (by Shift Crypto, Switzerland) and Ledger (France) are both excellent hardware wallets with secure elements and open-source components. The BitBox02 Bitcoin-only edition ($149) features a Dual-chip design with a secure element, invisible touch sensors, MicroSD backup, and fully open-source firmware. Ledger offers a wider product range (Nano S Plus $79, Nano X $149, Stax $279) with a certified secure element and the Ledger Live companion app. For Bitcoin-only users who want fully open-source firmware and elegant Swiss design, the BitBox02 is the better pick. For multi-coin users wanting a polished mobile app and broader cryptocurrency support, Ledger wins. Both keep your keys offline and support BIP39 seed phrases.',
	sections: [
		{
			heading: 'What makes the BitBox02 different from Ledger?',
			body: 'The BitBox02 stands apart in three ways. First, it is fully open source — both firmware and hardware designs are public, unlike Ledger whose secure element firmware is proprietary. Second, the BitBox02 uses a Dual-chip design combining a Microchip ATECC608B secure element with an STM32 general-purpose processor, providing defense in depth. Third, it features invisible touch sensors embedded in the side of the device (no visible buttons), giving it a clean, minimalist appearance. It also includes a MicroSD card slot for automatic seed phrase backup — store your encrypted seed on the MicroSD and keep it separate from the device. The BitBox02 comes in a Bitcoin-only edition and a multi-coin edition. Ledger offers more devices at different price points and supports over 5,500 cryptocurrencies through Ledger Live, but at the cost of proprietary firmware on the secure element.'
		},
		{
			heading: 'Which is more secure?',
			body: "Both wallets provide excellent security for everyday use. The BitBox02's fully open-source firmware means the entire codebase is publicly auditable — you don't have to trust Shift Crypto's claims about security. Its Dual-chip architecture (secure element + general-purpose processor) provides two independent layers. Ledger's certified secure element (Common Criteria EAL5+) has undergone formal security evaluation, making it one of the most rigorously tested chips in consumer hardware. The difference: Ledger's secure element code is not publicly auditable, while the BitBox02's is. For users who value transparency and verifiability, the BitBox02 wins. For users who prioritize formal security certification, Ledger has the edge. Both are vastly more secure than software wallets."
		},
		{
			heading: 'How do prices compare?',
			body: 'BitBox02: Bitcoin-only edition ($149) or multi-coin edition ($149), both from shiftcrypto.ch. Ledger: Nano S Plus ($79), Nano X ($149), Stax ($279) from ledger.com. The BitBox02 at $149 matches the Ledger Nano X price but includes a secure element, MicroSD backup, and fully open-source firmware. The Ledger Nano S Plus at $79 is the most affordable option if budget is the primary concern. For $149, the BitBox02 offers better transparency (fully open source) while the Nano X offers Bluetooth connectivity for mobile use.'
		},
		{
			heading: 'How does the setup experience compare?',
			body: "Both wallets offer guided setup through companion apps. The BitBoxApp provides a clean, minimal interface for setup, backup, and transaction management. During setup, the BitBox02 automatically backs up your seed phrase to an encrypted MicroSD card — a unique feature that simplifies backup management. Ledger Live is a more feature-rich app with support for staking, DeFi, and NFTs alongside basic wallet functions. Ledger's setup takes about 10 minutes via USB-C. The BitBox02's setup is equally quick, with the added benefit of MicroSD backup automation. Both require writing down a 24-word seed phrase, but the BitBox02's encrypted MicroSD backup provides an additional recovery option."
		},
		{
			heading: 'Which works better with BitTasker?',
			body: "Both integrate well with BitTasker. The BitBox02 pairs with Sparrow Wallet and the BitBoxApp for managing Bitcoin receiving addresses — add the address to your BitTasker profile for on-chain payments. Ledger works with Ledger Live for the same purpose. For Lightning payments on BitTasker, neither hardware wallet supports Lightning directly — use a Lightning-enabled software wallet for daily transactions and keep your hardware wallet for savings. The BitBox02's fully open-source firmware may appeal to privacy-conscious BitTasker users who want maximum transparency in their security stack."
		}
	],
	faq: [
		{
			question: 'Is BitBox02 more secure than Ledger?',
			answer:
				'The BitBox02 is more transparent (fully open source) while Ledger has a formally certified secure element (EAL5+). Both are highly secure. The BitBox02 wins on verifiability; Ledger wins on formal certification.'
		},
		{
			question: 'How much does the BitBox02 cost?',
			answer:
				'The BitBox02 costs $149 USD for either the Bitcoin-only or multi-coin edition, available from shiftcrypto.ch. This matches the Ledger Nano X price ($149) but includes fully open-source firmware and MicroSD backup.'
		},
		{
			question: 'Can I use BitBox02 with BitTasker?',
			answer:
				'Yes. Pair the BitBox02 with Sparrow Wallet or the BitBoxApp to generate Bitcoin receiving addresses, then add them to your BitTasker profile. The BitBox02 handles on-chain transactions via USB-C.'
		},
		{
			question: 'Does BitBox02 support altcoins?',
			answer:
				'The BitBox02 multi-coin edition supports Bitcoin, Ethereum, and select altcoins. The Bitcoin-only edition supports only Bitcoin. For extensive altcoin support (5,500+), Ledger is the better choice.'
		},
		{
			question: 'Is BitBox02 fully open source?',
			answer:
				'Yes, the BitBox02 is fully open source — firmware and hardware designs are publicly available. Ledger is partially open source: the secure element firmware is proprietary.'
		},
		{
			question: 'What is MicroSD backup?',
			answer:
				'The BitBox02 can automatically encrypt and store your seed phrase on a MicroSD card. If you lose the device, insert the MicroSD into a new BitBox02 to recover your wallet. This provides an additional backup option alongside your written seed phrase.'
		},
		{
			question: 'Where can I buy a BitBox02 or Ledger?',
			answer:
				'Buy the BitBox02 from shiftcrypto.ch and Ledger from ledger.com. Never purchase from Amazon, eBay, or third-party resellers to avoid tampered devices.'
		}
	],
	bitTaskerCta: {
		heading: 'Protect Your Bitcoin Freelance Earnings',
		body: 'Earn Bitcoin on BitTasker, store it securely on a BitBox02 or Ledger. Both keep your earnings offline — BitBox02 for open-source transparency, Ledger for multi-coin flexibility.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
