import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitBox02: Swiss-Made Bitcoin Hardware Wallet Guide',
		subtitle:
			'Dual-chip security, EAL6+ secure element, microSD backups, and a sleek touchscreen — made in Switzerland by Shift Crypto.'
	},
	answerBlock: `The BitBox02 is a Swiss-made hardware wallet manufactured by Shift Crypto, available in Bitcoin-only and Multi editions. It features a dual-chip design with an EAL6+ certified secure element (the Nova chip) for private key storage and a general-purpose microcontroller for device operations. The standard BitBox02 ($129) offers a clean capacitive-touch interface with an OLED display and microSD card backup, while the newer BitBox02 Nova ($149) adds Bluetooth connectivity for iOS support and a glass OLED display. Both models run open-source firmware that has been independently audited. The companion BitBoxApp provides a polished desktop and mobile experience with wallet management, firmware updates, and integration with WalletConnect for DeFi and Unchained Capital for multisig. With Swiss manufacturing, transparent security practices, and a user-friendly design, the BitBox02 strikes a balance between security and accessibility that appeals to both newcomers and experienced Bitcoin holders.`,
	sections: [
		{
			heading: 'What is the BitBox02 and who makes it?',
			body: `The BitBox02 is a hardware wallet designed and manufactured by Shift Crypto, a Swiss company founded in 2015 with roots in the Bitcoin and cryptographic security space. Shift Crypto was originally part of ChronoLogic, a Swiss time-stamping company, before pivoting to focus exclusively on hardware wallets. The BitBox02 is their flagship product — a compact, credit-card-sized device with a capacitive-touch "slide" interface, an OLED display, and a USB-C connection. It's available in two variants: the Bitcoin-only edition, which supports only BTC, and the Multi edition, which supports Bitcoin, Ethereum, and numerous ERC-20 tokens. Both editions share the same hardware architecture. The "BitBox" name refers to the device's role as a secure "box" for your Bitcoin keys. Shift Crypto manufactures the device in Switzerland, giving it Swiss quality assurance and regulatory compliance. The company has shipped over 100,000 units and has a strong reputation for security-focused design and responsive customer support.`
		},
		{
			heading: 'How does the BitBox02 dual-chip design work?',
			body: `The BitBox02 uses a dual-chip architecture that separates security-critical operations from general device functions. The secure element is an EAL6+ certified chip (upgraded to the Nova chip in the latest model) — this is the same class of secure element used in credit cards and passports. It generates and stores your private keys, performs cryptographic signing, and manages seed phrase encryption. The EAL6+ rating means the chip has undergone rigorous independent security evaluation and is resistant to physical attacks including power analysis, electromagnetic probing, and tampering. The second chip is a general-purpose microcontroller (Microchip SAM3X) that handles the OLED display, capacitive touch sensors, USB communication, and microSD card operations. This separation means that even if the general-purpose chip were somehow compromised, the secure element would still protect your private keys. The two chips communicate through a secure channel, and the firmware enforces strict boundaries between security-critical and non-critical operations. This architecture is similar to what Ledger uses, but Shift Crypto's implementation emphasizes transparency through open-source firmware and published security audits.`
		},
		{
			heading: 'BitBox02 vs BitBox02 Nova: What changed?',
			body: `The BitBox02 Nova, released as an updated model, introduces several improvements over the standard BitBox02. The most visible change is the glass OLED display, replacing the plastic-covered screen of the original. This provides better scratch resistance and a more premium feel. The Nova also adds Bluetooth connectivity, specifically designed for iOS support — since Apple restricts USB accessories, Bluetooth enables the Nova to work with the BitBoxApp on iPhone and iPad. The Bluetooth implementation is designed with security in mind: it uses encrypted communication and requires physical confirmation on the device for all transactions. The Nova chip (the secure element) is also updated, maintaining EAL6+ certification while improving performance. The standard BitBox02 remains available at $129 for users who don't need iOS support or prefer a purely USB-connected device. The Nova is priced at $149. Both models support microSD backup, the same BitBoxApp companion software, and WalletConnect integration. If you primarily use Android or desktop, the standard BitBox02 offers excellent value. If you need iOS support, the Nova is the clear choice.`
		},
		{
			heading: 'How does the BitBox02 microSD backup work?',
			body: `One of the BitBox02's distinctive features is its microSD-based backup system. During initial setup, the device creates an encrypted backup of your wallet seed on a microSD card. This backup is encrypted with a password you choose, so even if someone obtains the microSD card, they cannot access your seed without the password. The backup contains all the information needed to fully recover your wallet — seed phrase, derivation path, and account structure. For recovery, you insert the backup microSD card into a new BitBox02, enter your backup password, and the device restores your complete wallet. This is significantly more convenient than manually entering a 24-word seed phrase, especially during a stressful recovery scenario. Shift Crypto recommends creating multiple microSD backups stored in different secure locations. The device also supports standard BIP39 seed phrase backup — you can view and write down your 24-word seed as a secondary backup method. The microSD approach has a practical advantage: it's faster and less error-prone than manual seed entry, and the encrypted format adds an extra security layer compared to a plain-text paper backup.`
		},
		{
			heading: 'What is the BitBoxApp and what does it do?',
			body: `The BitBoxApp is Shift Crypto's companion software, available for Windows, macOS, Linux, iOS, and Android. It provides a clean, well-designed interface for managing your BitBox02 wallet — viewing balances, sending and receiving Bitcoin, and managing multiple accounts. The app supports both the Bitcoin-only and Multi editions, displaying BTC and (for Multi) ETH/ERC-20 balances in a unified portfolio view. Key features include firmware update delivery (the app checks for and installs firmware updates securely), microSD backup management, and WalletConnect integration for interacting with DeFi protocols (Multi edition only). For advanced users, the BitBoxApp supports Unchained Capital integration, enabling the BitBox02 to serve as a signing device in a multisig setup. The app also includes a coin control feature for UTXO management and supports Tor for enhanced privacy. Unlike Ledger Live or Trezor Suite, the BitBoxApp doesn't require account creation or personal information — it connects directly to your hardware wallet and communicates with Bitcoin nodes for balance queries. The open-source app code is available on GitHub for independent verification.`
		},
		{
			heading: 'Is the BitBox02 open source and audited?',
			body: `Yes, the BitBox02 is fully open source. Shift Crypto publishes all firmware source code, hardware schematics, and BitBoxApp source code on GitHub under open-source licenses. The firmware has undergone multiple independent security audits by reputable firms. Notable audits include reviews by Shift Crypto's own security team (which includes researchers with backgrounds in cryptographic security), as well as external audits by firms like Cyberhive and others specializing in embedded security. The EAL6+ secure element certification provides additional assurance that the key storage chip has been independently evaluated against a rigorous security standard. Shift Crypto also implements reproducible builds, allowing anyone to compile the firmware from source and verify the binary matches the production firmware. The company publishes a transparency report detailing their security practices, audit results, and any vulnerabilities discovered and patched. This commitment to transparency, combined with Swiss manufacturing and EAL6+ certification, makes the BitBox02 one of the most verifiable hardware wallets on the market.`
		},
		{
			heading: 'How do you set up and use the BitBox02?',
			body: `Setting up the BitBox02 is one of the most user-friendly experiences in the hardware wallet space. Download the BitBoxApp, connect the device via USB-C (or pair via Bluetooth with the Nova), and the app guides you through the setup process. You can choose to create a new wallet or restore from a backup. When creating a new wallet, the device generates a 24-word BIP39 seed phrase and offers to create an encrypted microSD backup. The capacitive touch "slide" interface on the device is used for confirming transactions and navigating menus — you slide left or right to select options and hold to confirm. This is more intuitive than the button-based interfaces on many competitors. For daily use, you connect the BitBox02 to your computer, open the BitBoxApp, and the app displays your balances and transaction history. To send Bitcoin, you enter the recipient address and amount in the app, then confirm the transaction details on the BitBox02's OLED display by sliding to approve. The device signs the transaction internally and sends it back to the app for broadcasting. The entire flow takes seconds and requires minimal interaction with the hardware wallet itself.`
		}
	],
	faq: [
		{
			question: 'How much does the BitBox02 cost?',
			answer: `The standard BitBox02 (Bitcoin-only or Multi) is priced at $129 USD. The BitBox02 Nova with Bluetooth and glass OLED display is $149 USD. Both are available directly from shiftcrypto.ch. A microSD card for backup is included in the box.`
		},
		{
			question: 'Is the BitBox02 Bitcoin-only?',
			answer: `The BitBox02 is available in two editions: Bitcoin-only, which supports only BTC, and Multi, which supports Bitcoin, Ethereum, and ERC-20 tokens. Both editions share the same hardware. The Bitcoin-only edition has a smaller firmware attack surface and is recommended for users focused exclusively on Bitcoin.`
		},
		{
			question: 'Does the BitBox02 work with iOS?',
			answer: `The standard BitBox02 does not work with iOS due to Apple's USB accessory restrictions. The BitBox02 Nova, which adds Bluetooth connectivity, supports iOS via the BitBoxApp on iPhone and iPad. Both models work with Android and desktop platforms.`
		},
		{
			question: 'Is the BitBox02 safe for long-term storage?',
			answer: `Yes. The BitBox02 uses an EAL6+ certified secure element — the highest commercially available security rating for embedded chips. Combined with the dual-chip architecture, encrypted microSD backups, and open-source firmware, it provides strong protection for long-term Bitcoin storage.`
		},
		{
			question: 'Can the BitBox02 be used for multisig?',
			answer: `Yes, the BitBox02 integrates with Unchained Capital for collaborative multisig setups. It also supports standard Bitcoin multisig through the BitBoxApp and third-party wallets like Sparrow Wallet and Electrum, using PSBT workflows.`
		},
		{
			question: 'What happens if I lose my BitBox02?',
			answer: `Your Bitcoin is recoverable using either your encrypted microSD backup or your 24-word seed phrase. Insert the backup into a new BitBox02 and enter your backup password, or use the seed phrase with any BIP39-compatible wallet. The device is just a signing tool — your funds are secured by the seed.`
		},
		{
			question: 'Does the BitBox02 support Lightning Network?',
			answer: `The BitBox02 does not support Lightning Network directly. It is an on-chain signing device. For Lightning functionality, pair it with a Lightning-compatible software wallet for daily spending while keeping long-term savings on the BitBox02.`
		}
	],
	bitTaskerCta: {
		heading: 'Secure your Bitcoin earnings with BitBox02',
		body: `When you earn Bitcoin on BitTasker, the BitBox02's microSD backup and EAL6+ secure element make it easy to protect your savings. The BitBoxApp integrates seamlessly for managing balances and signing transactions.`,
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	product: {
		name: 'BitBox02',
		description:
			'Swiss-made hardware wallet with elegant design, microSD backup, and optional Bitcoin-only firmware. Best balance of security and usability.',
		brand: 'Shift Crypto',
		image: '/images/wallets/bitbox.png',
		url: 'https://bitbox.swiss/bitbox02/',
		offers: {
			price: '130',
			priceCurrency: 'USD',
			availability: 'https://schema.org/InStock',
			url: 'https://bitbox.swiss/bitbox02/'
		},
		review: {
			reviewRating: {
				ratingValue: '4.6',
				bestRating: '5'
			},
			author: {
				'@type': 'Organization',
				name: 'BitTasker'
			},
			reviewBody:
				'Swiss-made hardware wallet with elegant design, microSD backup, and optional Bitcoin-only firmware. Best balance of security and usability.'
		}
	},
	howTo: {
		name: 'How to Set Up a BitBox02',
		description: 'Step-by-step guide to setting up the BitBox02 hardware wallet from Shift Crypto.',
		totalTime: 'PT15M',
		steps: [
			{
				name: 'Download BitBoxApp',
				text: 'Install the BitBoxApp on your desktop (Windows, macOS, Linux) or Android device.'
			},
			{
				name: 'Connect via USB-C',
				text: 'Plug the BitBox02 into your device using the USB-C cable. The app will detect the device automatically.'
			},
			{
				name: 'Create or restore wallet',
				text: 'Choose to create a new wallet or restore from an existing backup. Follow the on-screen prompts.'
			},
			{
				name: 'Generate seed phrase',
				text: 'The device generates a 24-word BIP39 seed phrase. Write it down and store it securely offline.'
			},
			{
				name: 'Create microSD backup',
				text: 'Insert the included microSD card and create an encrypted backup of your wallet. Store the card separately from the device.'
			},
			{
				name: 'Verify firmware',
				text: 'Check that the firmware is up to date and verify the green LED indicator confirms genuine firmware.'
			}
		]
	}
};
