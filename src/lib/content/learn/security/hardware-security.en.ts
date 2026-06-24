import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Hardware Wallet Security: Advanced Protection',
		subtitle: "Steel backups, Shamir's Secret Sharing, multisig setups, and firmware verification"
	},
	answerBlock:
		"Hardware wallet security goes beyond simply owning a device. Advanced protection includes steel seed phrase backups that survive house fires (1400°C+), Shamir's Secret Sharing (SSSS) for splitting your seed into multiple shares, passphrase-protected hidden wallets, and multi-signature setups requiring 2-of-3 or 3-of-5 keys to authorize spending. Common attack vectors include supply chain attacks (tampered devices), evil maid attacks (physical access), and phishing that tricks you into signing malicious transactions. Verifying firmware integrity through reproducible builds and manufacturer verification tools closes the remaining attack surface. For serious Bitcoin holders, combining a hardware wallet with steel backup, BIP39 passphrase, and multisig provides institutional-grade security at personal scale.",
	sections: [
		{
			heading: 'Why are hardware wallets more secure than software wallets?',
			body: "Hardware wallets keep your private keys in a dedicated secure element — a tamper-resistant chip that never exposes the keys to the internet or your computer. Software wallets store keys on a general-purpose device (phone, laptop) that is constantly connected to the internet, running untrusted software, and vulnerable to malware, phishing, and remote exploits. When you sign a transaction on a hardware wallet, the signing happens inside the secure chip. You verify the transaction details on the device's screen (address, amount) and physically press a button to confirm. Even if your computer is completely compromised by malware, the attacker cannot extract your keys or trick you into signing a transaction you did not verify on the device screen. This air-gap between your keys and the internet is the fundamental security advantage."
		},
		{
			heading: 'What seed phrase backup strategies go beyond paper?',
			body: "Paper backups are vulnerable to fire, water, and time. Steel backup devices (Coldcard Steel Wallet, Billfodl, Cryptosteel) are rated to survive house fires at 1400°C+ for over 2 hours, floods, and physical crushing. They use stamped or engraved metal plates to permanently record your 24 words. Shamir's Secret Sharing (SSSS) splits your seed phrase into N shares (e.g., 5), where any M shares (e.g., 3) can reconstruct the seed. This means no single location holds the complete seed — a thief would need to compromise multiple locations simultaneously. However, SSSS adds complexity. If you lose too many shares, your Bitcoin is gone forever. Most users are better served by 2–3 steel backups stored in separate geographic locations. Metal seed tablets (like the Coldcard Steel Tablet) offer a compact alternative to full steel wallets."
		},
		{
			heading: 'How does passphrase security compare to no-passphrase?',
			body: 'A BIP39 passphrase (the 25th word) creates an entirely separate wallet from the same seed phrase. Without a passphrase, your seed derives one set of addresses. With a passphrase, the same seed derives completely different addresses and balances. This provides two critical security layers. First, plausible deniability: if coerced, you can reveal the seed phrase without the passphrase — the attacker sees a small decoy wallet. The real funds are hidden behind the passphrase. Second, defense in depth: even if someone obtains your seed phrase (through theft, coercion, or a compromised backup), they cannot access your main funds without the passphrase. The passphrase should be: strong (not a dictionary word, 8+ characters), memorable (you must never forget it — there is no recovery), and stored separately from the seed phrase. Consider storing the passphrase in a different physical location than your seed backup.'
		},
		{
			heading: 'How do multi-signature setups provide maximum security?',
			body: 'Multi-signature (multisig) requires multiple private keys to authorize a transaction. A 2-of-3 setup means 2 out of 3 keys must sign before Bitcoin can be spent. This eliminates single points of failure: even if one key is compromised, the attacker cannot move funds alone. Common configurations: 2-of-3 with key distribution across a hardware wallet, a second hardware wallet, and a paper/steel backup stored in a third location. This provides redundancy (if one device is lost, 2 keys remain) and security (no single compromised key can drain funds). For high-value holdings, a 3-of-5 setup adds further resilience. Tools like Sparrow Wallet, Electrum, and Nunchuk support multisig configuration. Important considerations: you must manage multiple devices, ensure key backup redundancy, and understand that losing too many keys makes funds irrecoverable. Multisig adds complexity — deploy it only when your holdings justify the operational overhead.'
		},
		{
			heading: 'What are the common hardware wallet attack vectors?',
			body: "Supply chain attacks: Attackers purchase hardware wallets, extract or pre-generate seed phrases, reseal the packaging, and sell the tampered devices. When the victim initializes the wallet, the attacker already has the seed and drains funds. Prevention: buy only from the manufacturer and verify tamper-evident seals. Evil maid attacks: Someone with temporary physical access to your hardware wallet may attempt to modify it, copy the seed phrase, or install a hardware keylogger. Prevention: use a strong PIN, enable BIP39 passphrase (the device is useless without it), and store the device securely when not in use. Clipboard hijacking: Malware replaces Bitcoin addresses in your clipboard, redirecting funds to an attacker. Prevention: always verify the full address on the hardware wallet's screen before confirming. Firmware attacks: Compromised firmware could leak keys. Prevention: update through official apps only, verify firmware integrity, and prefer open-source firmware with reproducible builds."
		},
		{
			heading: 'How do you verify firmware integrity on a hardware wallet?',
			body: "Coldcard: Fully open source with reproducible builds. You can compile the firmware from source code on GitHub and compare the binary hash against the official release. The clear polycarbonate case allows visual inspection of the PCB for physical tampering. Trezor: Firmware is fully reproducible — you can build from source and verify the hash. Trezor Suite verifies integrity during installation. Ledger: Ledger Live performs automatic firmware verification against Ledger's servers. The secure element validates the firmware signature before booting. Ledger uses a closed-source secure element, which is a tradeoff between security and transparency. General rules: always update firmware through the official companion app (Ledger Live, Trezor Suite, BitBoxApp). Never update through third-party tools or links in emails. If a firmware update prompts you to enter your seed phrase on a computer, it is a scam. Check for firmware update announcements on the manufacturer's official channels."
		},
		{
			heading: 'How do you set up a hardware wallet securely?',
			body: "Step 1: Buy directly from the manufacturer's official website. Step 2: Verify tamper-evident packaging is intact when it arrives. Step 3: Initialize the device — generate a fresh seed phrase (never restore a seed you found or received from someone). Step 4: Write the 24 words on paper, then stamp or engrave on steel. Step 5: Set a strong PIN (6+ digits). Step 6: Enable BIP39 passphrase and create a strong passphrase — store it separately. Step 7: Send a small test transaction to verify everything works. Step 8: Store the hardware wallet, steel backup, and passphrase in separate secure locations. Step 9: Test recovery by restoring to a second device (if available) to verify your backup is correct. Never skip steps. The most common cause of Bitcoin loss is not hacking — it is failing to properly back up the seed phrase."
		}
	],
	faq: [
		{
			question: 'What is the most secure hardware wallet?',
			answer:
				'For pure Bitcoin security, the Coldcard Mk4 is widely regarded as the gold standard — fully open source, air-gapped signing, and a clear case for physical inspection. Foundation Passport offers premium QR-based air-gapped signing. Trezor provides the best balance of security and usability. The "most secure" depends on your threat model and technical comfort.'
		},
		{
			question: 'Do I need a steel backup for my seed phrase?',
			answer:
				'Yes. Paper degrades, burns, and gets wet. Steel wallets survive house fires (1400°C+), floods, and physical damage. For any meaningful Bitcoin holdings, a steel backup is a small investment that protects against catastrophic loss of your seed phrase.'
		},
		{
			question: "What is Shamir's Secret Sharing?",
			answer:
				'A cryptographic method that splits your seed into N shares (e.g., 5), where any M shares (e.g., 3) can reconstruct the full seed. No single share reveals any information about the seed. It eliminates single points of failure but adds complexity — lose too many shares and your Bitcoin is gone.'
		},
		{
			question: 'Should I use a BIP39 passphrase?',
			answer:
				'For significant holdings, yes. It creates a hidden wallet that protects your main funds even if your seed phrase is compromised. Choose a strong, memorable passphrase and store it separately from your seed. Never forget it — there is no recovery without it.'
		},
		{
			question: 'What is a multi-signature setup?',
			answer:
				'A wallet requiring multiple keys to authorize spending (e.g., 2-of-3). Provides redundancy and eliminates single points of failure. Ideal for large holdings where the operational complexity is justified by the security improvement.'
		},
		{
			question: 'How do I know if my hardware wallet has been tampered with?',
			answer:
				'Buy only from the manufacturer. Verify tamper-evident seals. For Coldcard, the clear case allows PCB inspection. For all devices, initialize fresh (never restore a pre-existing seed). If anything seems off, contact the manufacturer immediately.'
		},
		{
			question: 'Can firmware updates compromise my hardware wallet?',
			answer:
				'Compromised firmware could theoretically leak keys. Mitigate by: updating only through official apps, verifying firmware hashes against published checksums, and preferring devices with open-source, reproducible firmware (Coldcard, Trezor).'
		},
		{
			question: 'How often should I test my seed phrase backup?',
			answer:
				"Test your backup immediately after creating it by restoring to a second device (if available). After that, test annually or whenever you make significant changes to your setup. A backup you haven't tested is not a backup — it's a hope."
		}
	],
	bitTaskerCta: {
		heading: 'Secure Your BitTasker Earnings',
		body: 'BitTasker pays you directly to your wallet via Lightning. Combine a hardware wallet with steel backup, BIP39 passphrase, and multisig to protect your freelance earnings at institutional-grade security.',
		buttonText: 'Start Freelancing',
		buttonHref: '/auth/signup'
	}
};
