import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard vs Ledger: Bitcoin Cold Storage Showdown',
		subtitle:
			'Air-gapped Bitcoin-only vs secure element multi-coin — which protects your savings better?'
	},
	answerBlock:
		'Coldcard and Ledger are both excellent hardware wallets, but they serve different Bitcoiners. The Coldcard is a Bitcoin-only, air-gapped device that signs transactions via MicroSD card — it never connects to any networked device. Ledger is a multi-coin wallet with a certified secure element chip that connects via USB or Bluetooth. For maximum Bitcoin cold storage security, the Coldcard wins — its air-gapped design and dual secure elements eliminate every remote attack vector. For users who want one device for Bitcoin, Ethereum, and hundreds of altcoins with a polished mobile app, Ledger is the practical choice. Both keep your private keys offline, which is fundamentally safer than any exchange or software wallet.',
	sections: [
		{
			heading: 'What makes Coldcard different from Ledger?',
			body: "The Coldcard is Bitcoin-only and fully air-gapped. It never connects to a computer, phone, or network — transactions are signed by inserting a MicroSD card. Ledger connects via USB-C (Nano S Plus, Nano X, Stax) or Bluetooth (Nano X, Stax), which creates a physical data path between the device and a networked computer. The Coldcard uses dual secure elements (Microchip ATECC608 and Maxim DS28C36B) for redundant key protection. Ledger uses a single secure element (ST33 for newer devices). The Coldcard offers physical deterrent features — duress PINs that load a decoy wallet, brick PINs that destroy the secure element, and a login countdown timer. Ledger offers standard PIN protection and passphrase support. The Coldcard is fully open source. Ledger's secure element firmware is proprietary and not publicly auditable."
		},
		{
			heading: 'Which is more secure for storing Bitcoin?',
			body: "For pure Bitcoin cold storage, the Coldcard provides a higher security ceiling. Its air-gapped architecture means the private key never physically touches a computer — even during setup and transaction signing. The PSBT (Partially Signed Bitcoin Transaction) workflow via MicroSD creates an air gap that no USB or Bluetooth wallet can match. The Coldcard's dual secure elements provide two independent layers of cryptographic protection. Ledger's secure element is also highly resistant to physical extraction, making both devices extremely secure against hardware-level attacks. The difference is the connection model: Ledger requires USB/Bluetooth contact with a networked device during use, while the Coldcard never does. For most users, this difference is theoretical — both are vastly more secure than software wallets. But for significant Bitcoin holdings, the Coldcard's zero-network-contact design provides the strongest possible cold storage."
		},
		{
			heading: 'How does the price compare?',
			body: "Coldcard pricing: Mk5 ($149.87) for a compact numeric keypad, or Q ($214.87) for a full QWERTY keyboard with QR scanner. Ledger pricing: Nano S Plus ($79) for budget USB-C, Nano X ($149) for Bluetooth, Stax ($279) for E Ink touchscreen. Ledger offers a lower entry point at $79 vs Coldcard's $149.87. However, Ledger's lower price reflects its single secure element and non-air-gapped design. The Coldcard's premium covers dual secure elements, full air-gap architecture, and advanced physical security features. Neither requires subscription fees."
		},
		{
			heading: 'Does Coldcard support altcoins like Ledger?',
			body: "No. The Coldcard is strictly Bitcoin-only — it does not support Ethereum, ERC-20 tokens, Solana, or any other cryptocurrency. This is a deliberate design choice that reduces the attack surface. Ledger supports over 5,500 cryptocurrencies through Ledger Live, including native staking, DeFi, and NFT management. If you hold multiple cryptocurrencies, Ledger (or a Ledger plus a separate Bitcoin-only wallet) is the practical choice. If you are a Bitcoin maximalist who wants the strongest possible cold storage, the Coldcard's Bitcoin-only focus is a security feature, not a limitation."
		},
		{
			heading: 'Which works better with BitTasker?',
			body: 'Both work with BitTasker for Bitcoin payments. The Coldcard pairs with Sparrow Wallet for air-gapped transaction workflows — create unsigned transactions in Sparrow, sign them on the Coldcard via MicroSD, and broadcast. Ledger uses Ledger Live for a more integrated experience. For Lightning payments on BitTasker, neither supports Lightning natively — use a Lightning-enabled software wallet (Aquawallet, Blink, Phoenix) for daily transactions. The Coldcard is ideal for securing large BitTasker earnings long-term; Ledger is more convenient for regular access and multi-coin management.'
		}
	],
	faq: [
		{
			question: 'Is Coldcard more secure than Ledger?',
			answer:
				"For Bitcoin cold storage, yes. The Coldcard's air-gapped design (no USB, no Bluetooth) and dual secure elements provide a higher security ceiling. Ledger's secure element is also very secure, but the USB/Bluetooth connection creates a data path that the Coldcard eliminates entirely."
		},
		{
			question: 'Is Ledger cheaper than Coldcard?',
			answer:
				'Yes, the Ledger Nano S Plus at $79 is the most affordable option compared to the Coldcard Mk5 at $149.87. However, you get a single secure element and a non-air-gapped device at the lower price.'
		},
		{
			question: 'Can I use Coldcard with BitTasker?',
			answer:
				'Yes. Generate a Bitcoin receiving address through Sparrow Wallet (paired with your Coldcard), then add it to your BitTasker profile. The Coldcard handles on-chain transactions via air-gapped PSBT signing.'
		},
		{
			question: 'Can I use Ledger for Ethereum and Bitcoin?',
			answer:
				'Yes, Ledger supports over 5,500 cryptocurrencies including Bitcoin and Ethereum through Ledger Live. The Coldcard is Bitcoin-only — if you need multi-coin support, Ledger is the better choice.'
		},
		{
			question: 'Where can I buy a Coldcard or Ledger?',
			answer:
				'Buy directly from coinkite.com (Coldcard) or ledger.com (Ledger). Never buy from Amazon, eBay, or third-party resellers — hardware wallets from unauthorized sources may be tampered with.'
		},
		{
			question: 'Which is easier to set up?',
			answer:
				'Ledger is easier for beginners. Ledger Live guides you through setup, and the USB connection makes transaction management straightforward. The Coldcard requires understanding PSBTs and MicroSD workflows, which has a steeper learning curve but offers greater security.'
		},
		{
			question: 'Is Coldcard open source?',
			answer:
				'Yes, the Coldcard is fully open source — firmware and hardware designs are publicly available on GitHub with reproducible builds. Ledger is partially open source: Ledger Live is open, but the secure element firmware is proprietary.'
		}
	],
	bitTaskerCta: {
		heading: 'Secure Your Bitcoin Freelance Earnings',
		body: 'Earn Bitcoin on BitTasker, then store it on Coldcard or Ledger. The Coldcard is your offline vault; Ledger gives you multi-coin flexibility. Both protect your earnings far better than any exchange.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
