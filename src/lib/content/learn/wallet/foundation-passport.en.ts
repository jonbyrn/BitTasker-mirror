import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Foundation Passport: Bitcoin Hardware Wallet Review',
		subtitle:
			'A premium, open-source Bitcoin signer with a touchscreen, post-quantum encryption, and a 50GB encrypted vault.'
	},
	answerBlock: `The Foundation Passport is a premium Bitcoin-only hardware wallet manufactured by Foundation Devices in the United States at their ITAR-compliant facility. Priced at $349, it features a 3.5-inch IPS Gorilla Glass touchscreen, a Rust-based KeyOS microkernel with app sandboxing, and QuantumLink — a post-quantum encrypted Bluetooth protocol for secure communication with companion apps. The Passport goes beyond basic signing: it includes NFC Keycards with Faraday sleeves for encrypted backups, a 50GB encrypted Vault app for document storage, FIDO security key support, and TOTP 2FA capabilities. Both the hardware and software are fully open source and have been audited by Keylabs, a respected Bitcoin security firm. The Passport targets users who want a premium, multifunction Bitcoin security device rather than a minimalist cold storage signer.`,
	sections: [
		{
			heading: 'What makes the Foundation Passport unique?',
			body: `The Foundation Passport differentiates itself through three core design choices. First, it is purpose-built as a Bitcoin security platform, not just a signer. While most hardware wallets focus exclusively on transaction signing, the Passport incorporates a 50GB encrypted Vault app for secure document storage, FIDO2 security key functionality for passwordless authentication, and TOTP-based two-factor authentication — all running in sandboxed apps on its KeyOS microkernel. Second, the Passport uses QuantumLink, a custom post-quantum encrypted Bluetooth protocol that enables secure communication with your phone or computer without the vulnerabilities of standard Bluetooth pairing. This is designed to be resistant to future quantum computing attacks on encryption. Third, Foundation Devices manufactures the Passport entirely in the United States at an ITAR-compliant facility, giving users supply chain transparency that's rare in the hardware wallet industry. The combination of a premium touchscreen experience, multifunction security features, and domestic manufacturing positions the Passport as a high-end option for Bitcoiners who want more than basic cold storage.`
		},
		{
			heading: `How does the Passport's KeyOS work?`,
			body: `KeyOS is Foundation Devices' custom microkernel written in Rust, designed specifically for Bitcoin hardware wallet security. Unlike traditional hardware wallet firmware that runs as a single monolithic application, KeyOS implements app sandboxing — each application on the Passport (the signing app, Vault, FIDO key, TOTP authenticator) runs in an isolated environment with its own memory space and permissions. This means a vulnerability in one app cannot compromise the others. KeyOS also manages the secure element interaction, key derivation, and cryptographic operations. The Rust programming language was chosen for its memory safety guarantees, eliminating entire classes of vulnerabilities like buffer overflows and use-after-free bugs that plague C-based firmware. Foundation Devices publishes the KeyOS source code on GitHub, allowing independent verification of the security architecture. The microkernel approach is inspired by operating system security principles used in high-assurance systems, adapted for the specific constraints of a Bitcoin hardware wallet.`
		},
		{
			heading: 'What is QuantumLink and why does it matter?',
			body: `QuantumLink is Foundation Devices' proprietary post-quantum encrypted Bluetooth protocol, designed to secure the communication channel between the Passport and your companion devices (phone or computer). Standard Bluetooth pairing uses classical encryption algorithms that are theoretically vulnerable to quantum computing attacks. QuantumLink implements lattice-based cryptography — a class of algorithms believed to be resistant to both classical and quantum computers. This future-proofing ensures that even if quantum computers become practical in the coming decades, the data exchanged between your Passport and companion device remains secure. QuantumLink also improves the user experience: instead of traditional Bluetooth pairing that requires discoverable mode and PIN confirmation, QuantumLink uses a more secure key exchange mechanism that reduces the window for man-in-the-middle attacks. The protocol is used for transmitting unsigned transactions to the Passport and receiving signed transactions back, as well as for firmware updates and keycard operations. While quantum computing threats are not imminent, Foundation Devices' decision to implement post-quantum encryption demonstrates their long-term security philosophy.`
		},
		{
			heading: 'How do the Passport NFC Keycards and Vault app work?',
			body: `The Passport includes two NFC Keycards — credit-card-sized cards with embedded secure elements that store encrypted backups of your wallet data. Each Keycard comes with a Faraday sleeve that blocks all wireless signals, preventing unauthorized NFC reads when the card is in your possession. To create a backup, you tap a Keycard to the Passport's NFC reader, and the device writes an encrypted copy of your wallet data to the card's secure element. To restore, you tap the Keycard to a new Passport, enter your PIN, and the wallet recovers. This provides a convenient, air-gapped backup method that doesn't require writing seed words on paper. The Vault app is a 50GB encrypted storage space on the Passport's internal memory, designed for storing sensitive documents — encrypted files, password manager databases, or additional seed phrase backups. All data in the Vault is encrypted at rest using keys derived from your Passport's secure element. The Passport also functions as a FIDO2 security key, letting you use it for passwordless login on websites that support WebAuthn, and as a TOTP authenticator for generating two-factor authentication codes — eliminating the need for separate authenticator apps on your phone.`
		},
		{
			heading: 'Is the Foundation Passport open source and audited?',
			body: `Both the Passport hardware and software are fully open source. Foundation Devices publishes the complete schematics, PCB layouts, and mechanical drawings for the Passport hardware on GitHub, along with all firmware source code, KeyOS microkernel code, and companion app code. The Passport has undergone multiple independent security audits, most notably by Keylabs — a Bitcoin-focused security research firm known for their hardware wallet vulnerability disclosures. Keylabs examined the Passport's cryptographic implementations, secure element integration, and physical attack resistance. Foundation Devices also implements a verifiable build process, allowing independent parties to compile the firmware from source and verify that the resulting binary matches the production firmware. The company was founded by former members of the Casa and Blockstream teams, bringing deep Bitcoin security expertise to the product. Foundation Devices is based in the United States, and all manufacturing occurs domestically in an ITAR-compliant facility, providing supply chain transparency that's uncommon in the hardware wallet market.`
		},
		{
			heading: 'How does the Passport compare to Coldcard and Trezor?',
			body: `The Foundation Passport occupies a different market position than both the Coldcard and Trezor. Compared to the Coldcard (~$150-215), the Passport is significantly more expensive at $349 but offers a touchscreen interface, more storage (50GB Vault), FIDO2 key support, and built-in Bluetooth (via QuantumLink). The Coldcard focuses on minimalist, air-gapped security with MicroSD-based signing, while the Passport aims to be a comprehensive Bitcoin security platform. The Coldcard's air-gapped design is arguably more secure for pure cold storage, since it has no wireless communication capability whatsoever. Compared to the Trezor Model T ($219) or Safe 5 ($169), the Passport offers Bitcoin-only focus, US manufacturing, post-quantum encryption, and a larger feature set. Trezor supports multiple cryptocurrencies and has a longer track record, but the Passport's KeyOS microkernel architecture provides stronger application isolation. For users who want a premium, multifunction Bitcoin device and are comfortable with Bluetooth communication, the Passport is compelling. For purists who want the absolute maximum in air-gapped security, the Coldcard remains the reference standard.`
		},
		{
			heading: 'How do you set up the Foundation Passport?',
			body: `Setting up the Passport begins with downloading the Foundation companion app on your phone (iOS or Android) or desktop. Power on the Passport and follow the on-screen setup wizard on its 3.5-inch touchscreen. You'll generate a new wallet, which produces a 24-word BIP39 seed phrase displayed on the Passport's screen. Write these words on paper or use the NFC Keycard backup method. Set your PIN code and optionally configure a passphrase for additional security layers. The companion app connects to the Passport via QuantumLink Bluetooth, allowing you to view balances, create transactions, and manage the Vault app. You can enable additional apps — FIDO2 security key, TOTP authenticator, or Vault — from the Passport's app manager. Each app runs in its own sandboxed environment on KeyOS. For NFC Keycard backups, navigate to the backup menu on the Passport and tap each Keycard to write encrypted wallet data. Store the Keycards in their Faraday sleeves in separate secure locations. The Passport supports standard BIP44, BIP49, and BIP84 derivation paths, making it compatible with most Bitcoin wallet software for recovery purposes.`
		}
	],
	faq: [
		{
			question: 'How much does the Foundation Passport cost?',
			answer: `The Foundation Passport is priced at $349 USD and is available directly from foundationdevices.com. It ships with two NFC Keycards, Faraday sleeves, a USB-C cable, and a recovery card. International shipping is available, though ITAR regulations may restrict shipping to certain countries.`
		},
		{
			question: 'Is the Foundation Passport open source?',
			answer: `Yes, both the hardware designs and software are fully open source. Foundation Devices publishes all schematics, PCB layouts, firmware source code, and KeyOS microkernel code on GitHub. The Passport has also been audited by Keylabs, a Bitcoin security research firm.`
		},
		{
			question: 'Does the Foundation Passport support Ethereum or other coins?',
			answer: `No, the Passport is a Bitcoin-only hardware wallet. It does not support Ethereum, ERC-20 tokens, or any other cryptocurrency. This focus allows Foundation Devices to concentrate security resources exclusively on Bitcoin.`
		},
		{
			question: 'Is Bluetooth on the Passport secure?',
			answer: `The Passport uses QuantumLink, a custom post-quantum encrypted Bluetooth protocol designed to be resistant to both classical and quantum computing attacks. All data transmitted via QuantumLink is end-to-end encrypted. However, if you prefer zero wireless communication, the Coldcard's air-gapped MicroSD approach may be preferable.`
		},
		{
			question: 'Can I recover my wallet if I lose the Passport?',
			answer: `Yes. As long as you have your 24-word seed phrase (or an NFC Keycard backup), you can recover your Bitcoin on any BIP39-compatible hardware wallet. The seed phrase is the master backup — the Passport is just the signing device.`
		},
		{
			question: 'What is the Passport Vault app used for?',
			answer: `The Vault app provides 50GB of encrypted storage on the Passport for sensitive documents — encrypted files, password databases, or additional seed phrase backups. All data is encrypted at rest using keys derived from the Passport's secure element.`
		},
		{
			question: 'Does the Passport work with Sparrow Wallet?',
			answer: `The Passport primarily works with the Foundation companion app (iOS, Android, desktop). For integration with Sparrow Wallet or Electrum, you can export extended public keys (xpubs) from the Foundation app and import them into Sparrow for advanced UTXO management and PSBT workflows.`
		}
	],
	bitTaskerCta: {
		heading: 'Protect your Bitcoin earnings with Foundation Passport',
		body: `When you earn Bitcoin on BitTasker, use the Foundation Passport's Vault app to securely store backup keys, and keep your main holdings in its air-gapped signing environment. The touchscreen makes daily transaction management effortless.`,
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	product: {
		name: 'Foundation Passport Prime',
		description:
			'Premium Bitcoin hardware wallet with 3.5-inch touchscreen, KeyOS microkernel, and 50GB encrypted vault. Best for users wanting a multi-function security device.',
		brand: 'Foundation Devices',
		image: '/images/wallets/passport.png',
		url: 'https://foundationdevices.com/passport/',
		offers: {
			price: '349',
			priceCurrency: 'USD',
			availability: 'https://schema.org/InStock',
			url: 'https://foundationdevices.com/passport/'
		},
		review: {
			reviewRating: {
				ratingValue: '4.7',
				bestRating: '5'
			},
			author: {
				'@type': 'Organization',
				name: 'BitTasker'
			},
			reviewBody:
				'Premium Bitcoin hardware wallet with 3.5-inch touchscreen, KeyOS microkernel, and 50GB encrypted vault. Best for users wanting a multi-function security device.'
		}
	},
	howTo: {
		name: 'How to Set Up a Foundation Passport',
		description:
			'Step-by-step guide to setting up the Foundation Passport Prime hardware wallet with KeyOS.',
		totalTime: 'PT25M',
		steps: [
			{
				name: 'Download the companion app',
				text: 'Install the Foundation companion app on your phone (iOS or Android) or desktop.'
			},
			{
				name: 'Power on and start setup',
				text: 'Turn on the Passport and follow the on-screen setup wizard on the 3.5-inch touchscreen.'
			},
			{
				name: 'Generate seed phrase',
				text: 'Create a new wallet and write down the 24-word BIP39 seed phrase displayed on the screen.'
			},
			{
				name: 'Set your PIN',
				text: 'Choose a PIN code for device access. Optionally configure a passphrase for additional security.'
			},
			{
				name: 'Backup with NFC Keycard',
				text: 'Tap each Keycard to the Passport to write encrypted wallet data. Store Keycards in Faraday sleeves.'
			},
			{
				name: 'Connect via Bluetooth',
				text: 'Pair the Passport with the companion app using QuantumLink for balance viewing and transaction management.'
			}
		]
	}
};
