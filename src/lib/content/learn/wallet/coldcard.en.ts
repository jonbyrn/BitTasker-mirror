import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Coldcard: Bitcoin-Only Hardware Wallet Deep Dive',
		subtitle:
			'The most secure, air-gapped Bitcoin cold storage — fully open source and built by Coinkite since 2017.'
	},
	answerBlock: `The Coldcard is a Bitcoin-only hardware wallet made by Coinkite, designed for maximum security through air-gapped operation. It uses dual secure elements (Microchip ATECC608 and Maxim DS28C36B) to protect your private keys, and never connects to the internet. Transactions are signed via MicroSD card using Partially Signed Bitcoin Transactions (PSBTs, BIP174), making it immune to remote attacks. The Coldcard Q (~$200) features a full QWERTY keyboard and built-in QR scanner, while the Mk5 (~$150) offers a compact numeric keypad. Both models support BIP39 passphrases, duress PINs, and brick PINs for physical security. With fully open-source firmware and verifiable builds, the Coldcard is widely considered the gold standard for Bitcoin cold storage.`,
	sections: [
		{
			heading: 'What makes the Coldcard different from other hardware wallets?',
			body: `The Coldcard stands apart from competitors like Ledger and Trezor in three critical ways. First, it is strictly Bitcoin-only — there is no support for Ethereum, Solana, or any altcoin. This deliberate limitation shrinks the attack surface dramatically, since the firmware doesn't need to manage dozens of cryptographic protocols. Second, the Coldcard is fully air-gapped by default. Unlike wallets that require a USB or Bluetooth connection to a computer or phone, the Coldcard communicates exclusively through MicroSD cards, NFC, or QR codes. This means there is no physical data path for malware to exploit. Third, Coinkite uses dual secure elements — the Microchip ATECC608A and the Maxim DS28C36B — providing two independent layers of cryptographic protection for your keys. The combination of Bitcoin-only focus, air-gapped design, and redundant secure hardware makes the Coldcard one of the most hardened consumer Bitcoin wallets available.`
		},
		{
			heading: 'How does Coldcard air-gapped signing work?',
			body: `Air-gapped signing is the Coldcard's signature feature and the foundation of its security model. Here's how it works: when you want to send Bitcoin, you create an unsigned transaction on your computer (using Sparrow Wallet or Electrum), save it as a PSBT file to a MicroSD card, and insert the card into the Coldcard. The device displays the transaction details on its screen for you to verify — recipient address, amount, fees, and change output. Once you approve, the Coldcard signs the transaction cryptographically using your private key, which never leaves the secure element. You remove the MicroSD, plug it back into your computer, and broadcast the signed transaction to the Bitcoin network. The Coldcard Q also supports QR code-based PSBT flows, letting you scan unsigned transactions with its built-in camera and display signed transactions as QR codes for air-gapped devices like phone-based wallets. NFC signing is also supported, adding a third contactless option. At no point does the Coldcard connect to the internet, a computer, or any networked device.`
		},
		{
			heading: 'Coldcard Q vs Mk5: Which model should you buy?',
			body: `Coinkite offers two Coldcard models, each targeting different user profiles. The Coldcard Mk5 ($149.87) is the classic model — a compact device with a numeric keypad, a small OLED display, and MicroSD-based signing. It's the proven choice for users who want cold storage simplicity and don't mind typing passphrases on a number pad. The Coldcard Q ($214.87) is the premium model, featuring a full QWERTY keyboard, a larger display, a built-in QR code scanner, and a rechargeable battery. The Q is ideal for users who want QR-based PSBT flows, plan to use it as a mobile signing device, or simply prefer a more comfortable input experience. Both models share the same dual secure element architecture, open-source firmware, and support for BIP39 passphrases and trick PINs. The Q also includes a privacy-focused feature: it can generate a fresh ephemeral keypair for each QR code transaction, preventing address correlation. If you primarily use Sparrow Wallet at a desktop and want the most affordable option, the Mk5 is excellent. If you want maximum flexibility with QR and NFC workflows, the Q is worth the premium.`
		},
		{
			heading: 'What security features does the Coldcard offer?',
			body: `The Coldcard offers several advanced security features that go beyond standard hardware wallets. The trick PIN system allows you to set up multiple PIN codes with different behaviors. A duress PIN, when entered, loads a decoy wallet with a small balance — if someone coerces you into unlocking the device, they'll see a plausible but insignificant wallet. A brick PIN permanently destroys the secure element, rendering the device useless and protecting your keys from physical seizure. You can also set a login countdown timer, which delays access by a configurable period (up to 28 days), giving you time to move funds if the device is stolen. BIP39 passphrases add an additional word to your seed phrase, creating entirely separate wallet hierarchies. This lets you maintain a "plausible deniability" setup where one passphrase leads to a small visible wallet and another leads to your main holdings. The Coldcard's clear polycarbonate case also serves a security purpose — you can visually inspect the PCB for any signs of physical tampering or modifications before using the device.`
		},
		{
			heading: 'Which software wallets work with the Coldcard?',
			body: `Unlike Ledger and Trezor, which require their own proprietary companion apps, the Coldcard works with open-source Bitcoin wallets that you already trust. Sparrow Wallet is the primary recommended companion — it provides a full-featured desktop Bitcoin wallet with PSBT support, CoinJoin integration, and advanced UTXO management. Electrum is another well-supported option, offering lightweight Bitcoin wallet functionality with Coldcard integration. For mobile users, the Coldcard Q's QR code capabilities work with apps like Nunchuk and BlueWallet, enabling fully air-gapped mobile signing workflows. The Coldcard also integrates with Wasabi Wallet for users interested in CoinJoin-based privacy. All of these companion wallets are open source, and none of them require you to create an account or share any personal information. This open compatibility model means your Bitcoin security doesn't depend on any single company's software — you can switch companion apps at any time without affecting your cold storage setup.`
		},
		{
			heading: 'How do you set up a Coldcard for the first time?',
			body: `Setting up a Coldcard is straightforward but requires careful attention to security best practices. Power on the device and navigate to the security menu to generate a new seed phrase. The Coldcard will display a 24-word BIP39 mnemonic on its screen — write these words down on paper (never photograph them or store them digitally). The device will then ask you to verify specific words from the sequence to confirm you recorded them correctly. Next, set your main PIN and optionally configure a duress PIN and brick PIN. If you plan to use a BIP39 passphrase, set it up now — remember that forgetting your passphrase means losing access to those funds permanently. Insert a MicroSD card and export your wallet's public keys, then import them into Sparrow Wallet or Electrum on your computer. This gives your companion wallet read-only access to view balances and generate unsigned transactions. The Coldcard never shares its private keys with any software — it only signs transactions that you approve on its physical screen. For maximum security, generate the seed in a location free from cameras, and consider using the Coldcard's "seed word generation" feature that lets you provide entropy through dice rolls for additional randomness.`
		},
		{
			heading: 'Is the Coldcard open source? Verifiability and trust',
			body: `Yes, the Coldcard is fully open source — both the firmware and the hardware designs are publicly available on GitHub. Coinkite publishes the complete source code for the Coldcard firmware, including all cryptographic implementations, secure element interactions, and transaction signing logic. The firmware builds are reproducible, meaning independent parties can compile the source code and verify that the resulting binary matches what ships on the device. This verifiability is critical: it means you don't have to trust Coinkite's claims about security — you or any auditor can verify them. The hardware schematics are also open, so security researchers can examine the physical design for vulnerabilities. Coinkite has been building Bitcoin-only tools since 2013 and has a strong reputation in the Bitcoin community for prioritizing security over marketing. The Coldcard has been audited by third-party security firms and has no known critical vulnerabilities in its cryptographic implementation. This level of transparency is rare in the hardware wallet industry and is a key reason the Coldcard is trusted by technically sophisticated Bitcoin holders.`
		}
	],
	faq: [
		{
			question: 'How much does a Coldcard cost?',
			answer: `The Coldcard Mk5 is priced at $149.87 USD and the Coldcard Q at $214.87 USD, both available directly from coinkite.com. International shipping is available to most countries. You'll also need a MicroSD card (8GB or larger) and a MicroSD-to-USB adapter for your computer, which typically cost under $10 combined.`
		},
		{
			question: 'Where can I buy a Coldcard?',
			answer: `Purchase directly from Coinkite's official website (coinkite.com) to ensure you receive a genuine device. Avoid buying from Amazon, eBay, or third-party resellers, as hardware wallets purchased from unauthorized sources may have been tampered with. Coinkite ships worldwide from their warehouse.`
		},
		{
			question: 'Does Coldcard work with MetaMask or Ethereum?',
			answer: `No. The Coldcard is a Bitcoin-only hardware wallet. It does not support Ethereum, ERC-20 tokens, or any other cryptocurrency. This is by design — limiting the device to Bitcoin only reduces the attack surface and allows Coinkite to focus exclusively on Bitcoin security. If you need multi-coin support, consider a Trezor or Ledger instead.`
		},
		{
			question: 'Is the Coldcard safe for long-term Bitcoin storage?',
			answer: `Yes, the Coldcard is widely considered one of the safest options for long-term Bitcoin cold storage. Its air-gapped design means private keys never touch a networked device, dual secure elements provide redundant protection, and features like duress PINs and brick PINs add physical security layers. Combined with a BIP39 passphrase stored separately, the Coldcard provides institutional-grade cold storage.`
		},
		{
			question: 'Can I use the Coldcard with Sparrow Wallet?',
			answer: `Yes, Sparrow Wallet is the primary recommended companion for the Coldcard. Sparrow is an open-source desktop Bitcoin wallet that supports full PSBT workflows, making it ideal for air-gapped signing with the Coldcard. Import the Coldcard's public keys into Sparrow to view balances and create unsigned transactions.`
		},
		{
			question: 'What happens if I lose my Coldcard?',
			answer: `Your Bitcoin is safe as long as you have your 24-word seed phrase and any BIP39 passphrase you used. Simply purchase a new Coldcard (or any compatible BIP39 hardware wallet) and recover your wallet using the seed phrase. The Coldcard itself is just a signing device — your keys are derived from the seed phrase, not stored exclusively on the device.`
		},
		{
			question: 'Does the Coldcard support Lightning Network?',
			answer: `No, the Coldcard does not support Lightning Network transactions directly. It is designed for on-chain Bitcoin cold storage. For Lightning functionality, you can use a Lightning-compatible software wallet (like Aquawallet or Blink) for day-to-day transactions while keeping your long-term savings in the Coldcard.`
		}
	],
	bitTaskerCta: {
		heading: 'Secure your Bitcoin earnings with Coldcard',
		body: `When you earn Bitcoin on BitTasker, move your long-term savings to a Coldcard for air-gapped cold storage. Keep a smaller balance in a software wallet for everyday spending and escrow on the platform.`,
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	product: {
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
	howTo: {
		name: 'How to Set Up a Coldcard Bitcoin Wallet',
		description:
			'Step-by-step guide to setting up and configuring a Coldcard hardware wallet for secure Bitcoin storage.',
		totalTime: 'PT20M',
		steps: [
			{
				name: 'Unbox and power on',
				text: 'Remove the Coldcard from its tamper-evident bag, verify the bag number, and power it using USB or batteries.'
			},
			{
				name: 'Choose your PIN',
				text: 'Set a PIN code divided into two parts. Memorize the two anti-phishing words shown after the first half.'
			},
			{
				name: 'Generate or import seed phrase',
				text: 'Create a new 24-word BIP39 seed phrase using the TRNG, or import an existing one. Optionally use dice rolls for additional entropy.'
			},
			{
				name: 'Create MicroSD backup',
				text: 'Save an encrypted backup of your seed and settings to a MicroSD card. Store it securely offline.'
			},
			{
				name: 'Connect to Sparrow wallet',
				text: 'Export a skeleton wallet file from the Coldcard and import it into Sparrow or Electrum for transaction management.'
			},
			{
				name: 'Verify with a test transaction',
				text: 'Send a small amount of Bitcoin to your Coldcard address, then verify the balance appears correctly in your wallet software.'
			}
		]
	}
};
