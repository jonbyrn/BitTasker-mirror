import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Ledger vs Trezor: Which Hardware Wallet Is Better?',
		subtitle:
			'An honest, side-by-side comparison of the two most popular Bitcoin hardware wallets in 2026'
	},
	answerBlock: `Ledger and Trezor are the two most recognized names in Bitcoin hardware wallets, but they serve different priorities. Ledger uses a certified secure element chip (SE) to store private keys offline, offers a wider range of devices (Nano S Plus, Nano X, Stax), and supports more cryptocurrencies. Trezor uses an open-source approach with no secure element chip, making its code fully auditable but potentially more vulnerable to physical attacks. Both keep your keys offline and support BIP39 seed phrases. For Bitcoin-only users focused on transparency, Trezor Model T is the better pick. For multi-coin users wanting a tamper-resistant chip, Ledger wins. Either is far safer than keeping crypto on an exchange.`,
	sections: [
		{
			heading: 'What are the main differences between Ledger and Trezor?',
			body: `The fundamental difference is architecture. Ledger stores private keys on a certified secure element (ST33 or ST31), the same type of chip used in passports and credit cards. Trezor does not use a secure element — it relies on the main STM32 processor, which is fully open source but theoretically more exposed to physical side-channel attacks. Ledger's code is partially closed-source (the secure element firmware is proprietary), while Trezor is 100% open source. In practice, Ledger has a larger product lineup (Nano S Plus at $79, Nano X at $149, Stax at $279), while Trezor offers the Model One ($69) and Model T ($219). Both support BIP39 seed phrases, BIP32/BIP44 key derivation, and a wide range of cryptocurrencies — though Ledger supports over 5,500 coins while Trezor supports around 9,000 tokens via third-party wallets.`
		},
		{
			heading: 'Which is more secure, Ledger or Trezor?',
			body: `Both wallets are highly secure for normal use, but the security models differ. Ledger's secure element chip resists physical extraction attacks — an attacker with unlimited time and expensive lab equipment would still struggle to extract keys from a Ledger. Trezor's lack of a secure element means that a sophisticated attacker with physical access could potentially use voltage glitching or electromagnetic analysis to extract the seed. This was demonstrated in a 2020 attack on the Trezor Model One. However, Trezor's full open-source firmware means the entire codebase is auditable by anyone, while Ledger's secure element code is not publicly auditable. For most users who protect against remote attacks (malware, phishing), both wallets are equally secure — the private key never leaves the device. The secure element difference matters primarily if you worry about someone physically stealing your device.`
		},
		{
			heading: 'How much does a Ledger or Trezor cost?',
			body: `Ledger pricing: Nano S Plus ($79) is the budget option with USB-C and 128KB memory, supporting up to 100 apps simultaneously. Nano X ($149) adds Bluetooth connectivity and 2MB memory for more installed apps. Stax ($279) features an E Ink touchscreen and wireless charging. Trezor pricing: Model One ($69) is the most affordable option with a small OLED screen and no touchscreen. Model T ($219) features a color touchscreen and microSD card slot. Safe 3 ($79) is Trezor's newer budget option with a secure element. The Safe 5 ($169) has a haptic color touchscreen. For Bitcoin-only users, both the Ledger Nano S Plus and Trezor Model One offer excellent value under $100.`
		},
		{
			heading: 'Which wallet supports more cryptocurrencies?',
			body: `Both wallets support Bitcoin, Ethereum, and major altcoins natively. Ledger Live manages over 5,500 tokens and coins directly through its interface, including native support for staking, DeFi, and NFTs. Trezor Suite supports fewer coins natively (~9) but integrates with third-party wallets like MetaMask, Exodus, and Electrum to extend compatibility to thousands of tokens. For Bitcoin-only users, both wallets support all Bitcoin features (Taproot, PSBT, CoinJoin via third-party wallets). If you need extensive altcoin support with a polished interface, Ledger has the edge. If you want maximum transparency and use Bitcoin primarily, Trezor's open-source approach is compelling.`
		},
		{
			heading: 'Which works better with BitTasker?',
			body: `Both Ledger and Trezor work with BitTasker for receiving Bitcoin payments. Use Ledger Live or Trezor Suite to generate your receiving address, then paste it into your BitTasker profile. For Lightning payments, both hardware wallets require a companion Lightning wallet (like Aquawallet or Blink) since neither supports Lightning natively. The recommended workflow: keep your long-term savings on the hardware wallet, and use a Lightning-enabled software wallet for daily BitTasker earnings and spending. Both wallets support the PSBT standard, which works with Sparrow Wallet for advanced Bitcoin workflows.`
		},
		{
			heading: 'How do you set up a Ledger wallet for the first time?',
			body: `Download Ledger Live from ledger.com (verify the URL), connect your device via USB-C, and follow the on-screen setup. Choose a new wallet, write down the 24-word seed phrase on paper, and verify it by selecting the correct words on the device. Set a PIN (4–8 digits). Install the Bitcoin app through Ledger Live to start receiving BTC. For extra security, purchase directly from ledger.com — never buy hardware wallets from Amazon or eBay where devices could be tampered with.`
		},
		{
			heading: 'How do you set up a Trezor wallet for the first time?',
			body: `Go to trezor.io/start, connect your Trezor via USB, and install the firmware if prompted. Choose "Create new wallet," set a PIN, and record the 24-word seed phrase on paper. The Trezor will ask you to verify specific words. Install the Bitcoin app through Trezor Suite. For Trezor Model T and Safe 5, you enter the seed words on the touchscreen — for Model One and Safe 3, you verify them on the host computer (less secure but acceptable for normal use). Purchase only from trezor.io or authorized resellers.`
		}
	],
	faq: [
		{
			question: 'Is Ledger safer than Trezor?',
			answer: `For physical attacks, yes — Ledger's secure element chip makes key extraction significantly harder. For remote attacks (malware, phishing), both wallets are equally secure since keys never leave the device regardless. Most users face remote threats, not physical ones.`
		},
		{
			question: 'Which is cheaper, Ledger or Trezor?',
			answer: `The most affordable options are similar: Ledger Nano S Plus costs $79 and Trezor Safe 3 costs $79. The budget Trezor Model One is $69, making it the cheapest option. Premium devices range from $149 (Nano X) to $279 (Ledger Stax).`
		},
		{
			question: 'Can I use Ledger or Trezor with BitTasker?',
			answer: `Yes, both work with BitTasker. Generate a Bitcoin receiving address using Ledger Live or Trezor Suite, then add it to your BitTasker profile for on-chain payments. For Lightning payments, pair your hardware wallet with a Lightning-enabled software wallet.`
		},
		{
			question: 'Is Trezor fully open source?',
			answer: `Yes, Trezor is 100% open source — both firmware and hardware designs are publicly available on GitHub. Ledger is partially open source: the companion apps (Ledger Live) are open, but the secure element firmware is proprietary and not publicly auditable.`
		},
		{
			question: 'Where can I buy a Ledger or Trezor?',
			answer: `Buy directly from ledger.com (Ledger) or trezor.io (Trezor) to ensure you receive a genuine, untampered device. Avoid Amazon, eBay, and third-party resellers. Both companies ship worldwide.`
		},
		{
			question: 'Do Ledger or Trezor support Lightning Network?',
			answer: `Neither hardware wallet supports Lightning natively. Both are designed for on-chain cold storage. Use a Lightning-compatible software wallet (like Aquawallet, Blink, or Phoenix) for Lightning payments while keeping long-term savings on your hardware wallet.`
		},
		{
			question: 'What happens if I lose my Ledger or Trezor?',
			answer: `Your Bitcoin is safe if you have your 24-word seed phrase. Buy a new device (any BIP39-compatible wallet works) and recover your wallet using the seed phrase. The device is just a signing tool — your keys are derived from the seed, not stored exclusively on the hardware.`
		}
	],
	bitTaskerCta: {
		heading: 'Protect Your BitTasker Earnings with a Hardware Wallet',
		body: `Earn Bitcoin on BitTasker, then move your savings to a Ledger or Trezor for secure offline storage. Keep a Lightning wallet for daily spending and platform escrow.`,
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	product: [
		{
			name: 'Ledger Nano X',
			description:
				'Tamper-resistant hardware wallet with certified secure element chip, Bluetooth connectivity, and support for 5,500+ cryptocurrencies.',
			brand: 'Ledger',
			image: '/images/wallets/ledger-nano-x.png',
			url: 'https://www.ledger.com/',
			offers: {
				price: '149',
				priceCurrency: 'USD',
				availability: 'https://schema.org/InStock',
				url: 'https://www.ledger.com/'
			},
			review: {
				reviewRating: {
					ratingValue: '4.3',
					bestRating: '5'
				},
				author: {
					'@type': 'Organization',
					name: 'BitTasker'
				},
				reviewBody:
					'Tamper-resistant hardware wallet with certified secure element chip, Bluetooth connectivity, and support for 5,500+ cryptocurrencies.'
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
