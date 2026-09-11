import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Foundation Passport vs Coldcard: Air-Gapped Compared',
		subtitle:
			'Two Bitcoin-only, air-gapped wallets — which premium cold storage device is right for you?'
	},
	answerBlock:
		'The Foundation Passport and Coldcard are both premium, Bitcoin-only, air-gapped hardware wallets that never connect to the internet. The Passport (by Foundation Devices, ~$349) features a large touchscreen, QR code scanning, and a sleek machined-aluminum body. The Coldcard (by Coinkite, $150–$215) uses MicroSD-based PSBT signing with a compact design and dual secure elements. Both are fully open source. The Passport offers a more polished, smartphone-like experience with its touchscreen and QR workflows. The Coldcard provides stronger physical security features (duress PINs, brick PINs, login timers) and costs less. Choose the Passport for usability and design; choose the Coldcard for maximum physical security and value.',
	sections: [
		{
			heading: 'What are the key differences between Passport and Coldcard?',
			body: 'Both wallets share the same core philosophy — Bitcoin-only, air-gapped, fully open source — but differ in execution. The Foundation Passport uses a large color touchscreen (2.7") and communicates exclusively via QR codes. Its machined aluminum body, haptic feedback, and rechargeable battery give it a premium feel similar to a smartphone. The Coldcard communicates via MicroSD, NFC, and QR (Q model only) with a smaller OLED display and either a numeric keypad (Mk5) or QWERTY keyboard (Q). The Passport has one secure element (ATECC608B). The Coldcard has two (ATECC608A + Maxim DS28C36B), providing redundant key protection. The Passport costs ~$349, while the Coldcard ranges from $149.87 (Mk5) to $214.87 (Q).'
		},
		{
			heading: 'Which has better security features?',
			body: "The Coldcard wins on physical security features. It offers duress PINs (which load a decoy wallet under coercion), brick PINs (which permanently destroy the secure element if seized), and a login countdown timer (which delays device access by up to 28 days). The Foundation Passport provides standard PIN protection and passphrase support but lacks these advanced physical deterrents. Both wallets use secure elements for key storage, but the Coldcard's dual-element architecture provides a second independent layer of protection. For users who worry about physical seizure, coercion, or theft, the Coldcard's security suite is unmatched. For users focused primarily on digital/remote threats, both wallets are equally secure — the air-gapped design prevents all remote attacks."
		},
		{
			heading: 'How do the signing workflows differ?',
			body: "The Passport uses a QR-code-first workflow: create a PSBT on your companion wallet (Sparrow, Nunchuk), display it as a QR code, scan it with the Passport camera, verify on screen, and display the signed transaction as a QR code for your companion wallet to broadcast. The Coldcard's primary workflow uses MicroSD cards: save a PSBT to the card, insert it into the Coldcard, verify and sign, then remove the card and broadcast from your computer. The Coldcard Q also supports QR and NFC signing. Both workflows are fully air-gapped — no USB, no Bluetooth, no network contact. The Passport's QR workflow is slightly more intuitive for smartphone users, while the Coldcard's MicroSD workflow is more established and faster for desktop users."
		},
		{
			heading: 'Which is better for beginners?',
			body: 'The Foundation Passport is more beginner-friendly. Its large touchscreen provides visual guidance during setup and signing, QR code workflows feel familiar to smartphone users, and the device has a polished, consumer-friendly design. The Coldcard requires more technical knowledge — understanding PSBTs, managing MicroSD cards, and navigating a smaller display with a numeric keypad or keyboard. For Bitcoin newcomers who want air-gapped security without a steep learning curve, the Passport is the better entry point. For technically proficient users who want maximum security features and value, the Coldcard is superior.'
		},
		{
			heading: 'Which works better with BitTasker?',
			body: "Both integrate well with BitTasker for Bitcoin payments. The Passport pairs with Sparrow Wallet and Nunchuk via QR codes — generate a receiving address, scan it with the Passport to verify, and add it to your BitTasker profile. The Coldcard pairs with Sparrow Wallet via MicroSD for the same purpose. For long-term storage of BitTasker earnings, both provide institutional-grade air-gapped cold storage. The Passport's QR workflow is slightly faster for mobile users. The Coldcard's MicroSD workflow is better for desktop-first users. Neither supports Lightning natively — pair with a Lightning wallet for daily BitTasker transactions."
		}
	],
	faq: [
		{
			question: 'Which is more secure, Passport or Coldcard?',
			answer:
				'The Coldcard offers stronger physical security with duress PINs, brick PINs, and login timers — features the Passport lacks. Both provide excellent digital security through air-gapped, Bitcoin-only designs with secure elements.'
		},
		{
			question: 'How much does the Foundation Passport cost?',
			answer:
				'The Foundation Passport costs approximately $349 USD, available from foundationdevices.com. The Coldcard Mk5 ($149.87) and Q ($214.87) are significantly cheaper.'
		},
		{
			question: 'Is the Passport easier to use than Coldcard?',
			answer:
				"Yes, the Passport's large touchscreen and QR-code workflows are more intuitive for beginners. The Coldcard requires understanding PSBTs and MicroSD management, which has a steeper learning curve."
		},
		{
			question: 'Can I use both with BitTasker?',
			answer:
				'Yes. Both generate standard Bitcoin addresses compatible with BitTasker. Pair with Sparrow Wallet (Coldcard) or Sparrow/Nunchuk (Passport) to manage receiving addresses.'
		},
		{
			question: 'Are both wallets fully open source?',
			answer:
				'Yes, both the Foundation Passport and Coldcard are fully open source — firmware and hardware designs are publicly available. Both support reproducible firmware builds.'
		},
		{
			question: 'Where can I buy these wallets?',
			answer:
				'Buy the Passport from foundationdevices.com and the Coldcard from coinkite.com. Never purchase from Amazon, eBay, or third-party resellers.'
		}
	],
	bitTaskerCta: {
		heading: 'Secure Your Bitcoin Freelance Earnings',
		body: 'Earn Bitcoin on BitTasker, then store it air-gapped on a Passport or Coldcard. Both keep your earnings completely offline — choose the one that fits your workflow.',
		buttonText: 'Start Earning',
		buttonHref: '/auth/signup'
	}
};
