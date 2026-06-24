import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Wallet Security: Protect Your Bitcoin from Hackers',
		subtitle:
			'Hardware wallet best practices, seed phrase backup, and common attack vectors explained'
	},
	answerBlock:
		'Bitcoin wallet security is about protecting your private keys — the cryptographic proof that you own your Bitcoin. The most important practice is using a hardware wallet (Coldcard, Ledger, Trezor) for long-term storage, which keeps your keys offline and out of reach from hackers. Seed phrase backup is critical: store your 24-word phrase on steel (fireproof), never digitally, and consider geographic separation. Common attacks include phishing (fake wallet websites), supply chain attacks (tampered devices), and evil maid attacks (physical access to your device). Using a BIP39 passphrase adds a crucial security layer. Multi-signature setups provide the highest level of security for large holdings. BitTasker integrates with all major hardware wallets and enforces secure payment flows through Lightning Network.',
	sections: [
		{
			heading: 'What are the best practices for hardware wallet security?',
			body: 'Buy your hardware wallet directly from the manufacturer (ledger.com, trezor.io, coinkite.com) — never from Amazon, eBay, or resellers where devices may be pre-configured with attacker-controlled seed phrases. Verify the tamper-evident packaging is intact. During setup, generate a fresh seed phrase (never restore an old one you found). Write the 24 words on paper, then stamp or engrave them on a steel backup device (Coldcard Steel Wallet, Billfodl, Cryptosteel). Steel survives fires, floods, and physical damage that destroys paper. Set a strong PIN (6+ digits). Enable the BIP39 passphrase feature for an additional security layer — this creates a separate hidden wallet accessible only with the passphrase. Store the passphrase separately from the seed phrase. Keep the hardware wallet in a secure location when not in use, and never leave it plugged into a computer unattended.'
		},
		{
			heading: 'How should you back up your seed phrase?',
			body: "The three-layer backup strategy provides maximum protection. Layer 1: Write all 24 words in order on plain paper using a pen (pencil fades over time). Store in a fireproof safe or safety deposit box. Never photograph, scan, or type the seed phrase into any digital device. Layer 2: Stamp or engrave the words onto a steel backup device. Steel wallets (like the Coldcard Steel Wallet or Billfodl) are rated to survive house fires (1400°C+ for 2+ hours), floods, and physical crushing. Layer 3: Geographic separation — store the backup in a different physical location from your primary copy. If your house burns down, you don't want both copies to be destroyed. For BIP39 passphrases, store the passphrase on a separate piece of paper in a different location. If an attacker finds your seed phrase, the passphrase prevents access to your main funds."
		},
		{
			heading: 'What is a BIP39 passphrase and should you use one?',
			body: 'A BIP39 passphrase (also called the 25th word) is an optional addition to your 24-word seed phrase that creates an entirely separate wallet hierarchy. With no passphrase, your seed phrase derives one set of addresses. With a passphrase, the same seed phrase derives completely different addresses and balances. This provides two benefits: plausible deniability and an additional security layer. If coerced, you can reveal the seed phrase without the passphrase — the attacker sees a small decoy wallet (if you have one set up). The real funds are accessible only with the passphrase. Even if someone obtains your seed phrase, they cannot access your main funds without the passphrase. Store the passphrase separately from the seed words. Use a strong, unique passphrase (not a dictionary word). Never forget it — there is no recovery without it.'
		},
		{
			heading: 'What are the common Bitcoin wallet attacks to watch for?',
			body: 'Phishing: Attackers create fake wallet websites (e.g., "ledger-wallet.com" instead of "ledger.com") that look identical to the real site. The fake site prompts you to enter your seed phrase, which the attacker captures. Always verify the URL and download wallets only from official sources. Supply chain attacks: Attackers purchase hardware wallets, extract the pre-generated seed phrases, reseal the packaging, and sell the tampered devices. When the victim initializes the wallet, the attacker already has the seed phrase and drains the funds. Prevention: buy only from the manufacturer and verify tamper-evident seals. Evil maid attacks: Someone with temporary physical access to your hardware wallet modifies it or copies your seed phrase. Prevention: use a strong PIN, enable the passphrase feature, and store the device securely. Clipboard hijacking: Malware replaces Bitcoin addresses in your clipboard when you copy-paste, sending funds to the attacker. Prevention: always verify the full address on your hardware wallet\'s screen before confirming.'
		},
		{
			heading: 'How do you verify your wallet firmware is genuine?',
			body: "Ledger: Ledger Live performs automatic firmware verification against Ledger's servers during installation. The secure element validates the firmware signature before booting. Trezor: Trezor Suite verifies firmware integrity during installation. You can also verify builds from source code on GitHub — Trezor firmware is fully reproducible. Coldcard: The firmware is fully open source with reproducible builds. You can compile from source and compare the binary hash against the official release. The Coldcard's clear polycarbonate case allows visual inspection of the PCB for physical tampering. General best practice: always update firmware through the official companion app (Ledger Live, Trezor Suite, BitBoxApp) — never through third-party tools. If a firmware update prompts you to enter your seed phrase on a computer, it is likely a scam."
		},
		{
			heading: 'What is a multi-signature setup?',
			body: 'A multi-signature (multisig) wallet requires multiple private keys to authorize a transaction — for example, 2-of-3 or 3-of-5 keys must sign before Bitcoin can be spent. This protects against single points of failure: even if one key is compromised, the attacker cannot move funds without the other required keys. Common setups include: 2-of-3 with keys on a hardware wallet, a second hardware wallet, and a paper backup stored separately. This provides redundancy (if one device is lost, two keys remain) and security (no single compromised key can drain funds). For large Bitcoin holdings, multisig provides institutional-grade security. Tools like Sparrow Wallet and Electrum support multisig configuration. Note that multisig adds complexity — ensure you understand the key management before deploying.'
		},
		{
			heading: 'How does BitTasker handle wallet security?',
			body: 'BitTasker integrates with standard Bitcoin security practices. Your Nostr identity (private key) never touches BitTasker servers — it stays on your device. Payments flow via Lightning Network directly to your connected wallet, with no custodial intermediary. For on-chain transactions, BitTasker supports standard Bitcoin addresses from any hardware or software wallet. The platform does not store your seed phrase, private keys, or wallet credentials. Your security is your own responsibility — BitTasker provides the tools (NWC integration, Lightning payments, smart contract escrow) but you control the keys. This is the Bitcoin ethos: you are your own bank. Follow the security practices in this guide to protect your BitTasker earnings.'
		}
	],
	faq: [
		{
			question: 'What is the most important wallet security practice?',
			answer:
				'Protecting your seed phrase. Store it on steel (fireproof), never digitally, and in a secure location. A BIP39 passphrase adds an additional critical layer. The seed phrase IS your Bitcoin — treat it as the most valuable thing you own.'
		},
		{
			question: 'Should I use a hardware or software wallet?',
			answer:
				'Both. A hardware wallet (Coldcard, Ledger, Trezor) for long-term savings — keys stay offline. A software wallet (Sparrow, Aquawallet) for daily spending — convenient but less secure. Keep your largest holdings on the hardware wallet.'
		},
		{
			question: 'What is a BIP39 passphrase?',
			answer:
				'An optional 25th word added to your seed phrase that creates a separate hidden wallet. Even if someone has your seed phrase, they cannot access your funds without the passphrase. Store it separately from the seed words.'
		},
		{
			question: 'How do I know if my hardware wallet is genuine?',
			answer:
				'Buy directly from the manufacturer (ledger.com, trezor.io, coinkite.com). Verify tamper-evident packaging. Never buy from Amazon, eBay, or resellers where devices may be pre-configured with attacker-controlled seeds.'
		},
		{
			question: 'What is a multi-signature wallet?',
			answer:
				'A wallet requiring multiple private keys to authorize transactions (e.g., 2-of-3). If one key is compromised, the attacker cannot move funds alone. Provides institutional-grade security for large holdings.'
		},
		{
			question: 'Can BitTasker access my wallet?',
			answer:
				'No. BitTasker uses Nostr Wallet Connect (NWC) which grants limited permissions — the platform can request payments but never accesses your private keys or seed phrase. You can revoke access at any time.'
		},
		{
			question: 'What should I do if I think my wallet is compromised?',
			answer:
				'Immediately transfer all funds to a new wallet with a fresh seed phrase. If you have a BIP39 passphrase, use a different passphrase. Contact the wallet manufacturer if you suspect a supply chain attack. Consider using a multi-signature setup going forward.'
		},
		{
			question: 'How often should I update my wallet firmware?',
			answer:
				'Update when the manufacturer releases security patches or new features. Check for updates monthly. Always update through the official companion app — never through third-party tools or links in emails.'
		}
	],
	bitTaskerCta: {
		heading: 'Secure Your Earnings with Best Practices',
		body: 'BitTasker pays you directly to your wallet. Follow the security practices in this guide — hardware wallet, steel seed backup, BIP39 passphrase — to protect your Bitcoin freelance earnings.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Secure Your Bitcoin Wallet',
		description:
			'Step-by-step guide to implementing best practices for protecting your Bitcoin from hackers and physical threats.',
		totalTime: 'PT25M',
		steps: [
			{
				name: 'Use a hardware wallet',
				text: 'Purchase a hardware wallet directly from the manufacturer (Coldcard, Ledger, Trezor). Never buy from Amazon, eBay, or resellers where devices may be tampered with.'
			},
			{
				name: 'Back up seed phrase with steel wallet',
				text: 'Write your 24-word seed phrase on paper, then stamp or engrave it onto a steel backup device. Steel survives fires, floods, and physical damage that destroys paper.'
			},
			{
				name: 'Enable passphrase',
				text: 'Activate the BIP39 passphrase feature (25th word) to create a separate hidden wallet. Store the passphrase separately from the seed words for an additional security layer.'
			},
			{
				name: 'Set up multi-signature',
				text: 'For large holdings, configure a multi-signature wallet (e.g., 2-of-3) requiring multiple keys to authorize transactions. This protects against single points of failure.'
			},
			{
				name: 'Verify firmware regularly',
				text: 'Update firmware through the official companion app only. Verify builds from source when possible, and check for security patches monthly.'
			},
			{
				name: 'Use dedicated device',
				text: 'Consider using a dedicated device for Bitcoin management that you do not use for browsing, email, or other activities. This reduces the attack surface significantly.'
			}
		]
	}
};
