import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Wallet Guide: Everything You Need',
		subtitle:
			'Hardware wallets, software wallets, comparisons, and education — your complete reference'
	},
	answerBlock:
		'Choosing the right Bitcoin wallet is the most important decision you will make as a Bitcoin user. This guide covers hardware wallets (Coldcard, Trezor, BitBox, Passport) for cold storage, software wallets (Sparrow, Electrum) for desktop management, mobile wallets (Aqua, Blink) for daily spending, and Lightning wallets for instant payments. Whether you are protecting your first $100 or securing life-changing savings, the right wallet setup balances security, convenience, and cost. Most experienced Bitcoiners use a two-tier approach: a hardware wallet for savings and a mobile wallet for spending.',
	sections: [
		{
			heading: 'What are hardware wallets for Bitcoin cold storage?',
			body: 'Hardware wallets are the gold standard for protecting Bitcoin. They store your private keys in a tamper-resistant secure element that never exposes keys to the internet. Top options: Coldcard Mk5 ($150) — the most security-focused Bitcoin-only wallet with air-gapped signing via NFC, no USB, fully open source with reproducible builds. Trezor Model T ($219) — touchscreen interface, supports Bitcoin and altcoins, fully open source. BitBox02 ($149) — compact, microSD backup, elegant design. Foundation Passport ($349) — premium QR-code-based air-gapped signing with a large display. Ledger Nano X ($149) — widest cryptocurrency support but closed-source secure element. For maximum Bitcoin security, Coldcard is the consensus choice among security-focused users. For versatility and ease of use, Trezor offers the best balance.'
		},
		{
			heading: 'How do software wallets work for desktop Bitcoin management?',
			body: 'Software wallets run on your computer and offer advanced features for power users. Sparrow Wallet is the leading desktop Bitcoin wallet — fully featured, privacy-focused, supports multi-signature, CoinJoin, and hardware wallet integration. Electrum is the longest-running Bitcoin wallet (since 2011), lightweight, and extensible with plugins. Both support hardware wallet connectivity, allowing you to use your Coldcard, Trezor, or BitBox with a desktop interface. Software wallets are ideal for: managing complex transactions, setting up multi-signature wallets, CoinJoin for privacy, and detailed transaction analysis. They are not recommended for storing large amounts on an always-on computer — use them in conjunction with a hardware wallet.'
		},
		{
			heading: 'What are the best mobile wallets for everyday Bitcoin spending?',
			body: 'Mobile wallets are optimized for convenience and daily use. Aqua Wallet is self-custodial, supporting Bitcoin, Liquid Network, and Lightning in one app — the most versatile mobile option for users who want key control. Blink Wallet is custodial and Lightning-first, built for simplicity with a dollar-denominated balance, ideal for users in El Salvador and Latin America. Both are free. For self-custody on mobile, Aqua is the top choice. For simplicity and Lightning convenience, Blink excels. Never store more than spending money on a mobile wallet — phones are lost, stolen, and compromised regularly.'
		},
		{
			heading: 'How do Lightning wallets enable instant Bitcoin payments?',
			body: 'Lightning Network enables instant Bitcoin payments with negligible fees (typically less than 1 satoshi). Aqua Wallet supports Lightning alongside on-chain and Liquid. Blink Wallet is Lightning-native with the simplest UX for everyday payments. Phoenix Wallet (Android/iOS) is a popular self-custodial Lightning wallet with automatic channel management. For merchants and freelancers, Lightning is the preferred payment rail — payments settle in seconds, not minutes. BitTasker uses Lightning for instant freelancer payouts, making it the fastest way to receive Bitcoin for work.'
		},
		{
			heading: 'How do hardware wallets compare to each other?',
			body: "Coldcard vs Trezor: Coldcard is Bitcoin-only, air-gapped, and fully open source — best for security purists. Trezor supports altcoins, has a touchscreen, and is more beginner-friendly. Coldcard vs Ledger: Coldcard is fully open source; Ledger uses a closed-source secure element. Coldcard offers air-gapped signing; Ledger requires USB. For Bitcoin-only security, Coldcard wins. Trezor vs Ledger: Trezor is fully open source; Ledger has a wider range of supported cryptocurrencies. Trezor's touchscreen (Model T) is more intuitive than Ledger's button interface. Passport vs Coldcard: Both offer air-gapped signing. Passport uses QR codes; Coldcard uses NFC. Passport has a larger display; Coldcard has a longer track record."
		},
		{
			heading: 'How do you choose the right Bitcoin wallet?',
			body: 'Ask yourself: What will you use it for? Savings = hardware wallet. Daily spending = mobile wallet. How much Bitcoin do you hold? Under $500 in spending money works on mobile. Significant savings belong on hardware. Do you need Lightning? If you make frequent small payments, yes — choose Aqua or Blink. What is your technical comfort level? Beginners: Blink (simplest) or Aqua (self-custodial but friendly). Intermediate: Trezor + Sparrow. Advanced: Coldcard + Sparrow with multisig. The recommended two-tier setup: Coldcard or BitBox for savings, Aqua Wallet for spending. This gives you maximum security for your wealth and maximum convenience for daily transactions.'
		}
	],
	faq: [
		{
			question: 'What is the best Bitcoin wallet for beginners?',
			answer:
				'Blink Wallet for the simplest experience with dollar-denominated balance. Aqua Wallet if you want self-custody from day one. Both are free on iOS and Android.'
		},
		{
			question: 'What is the most secure Bitcoin wallet?',
			answer:
				'Coldcard Mk5 — fully open source, air-gapped signing, no USB, reproducible builds. Combined with a steel backup and BIP39 passphrase, it provides institutional-grade security.'
		},
		{
			question: 'How much does a Bitcoin wallet cost?',
			answer:
				'Mobile wallets (Aqua, Blink) are free. Hardware wallets range from $79 to $249. Coldcard ~$150, Trezor Model T ~$219, BitBox02 ~$149, Foundation Passport ~$349.'
		},
		{
			question: 'Can I use multiple Bitcoin wallets?',
			answer:
				'Yes, and you should. Most experienced users keep savings on a hardware wallet and spending money on a mobile wallet. This "savings + checking" model balances security and convenience.'
		},
		{
			question: 'What is the difference between a hot wallet and a cold wallet?',
			answer:
				'A hot wallet (mobile/desktop) is connected to the internet — convenient but vulnerable. A cold wallet (hardware device) keeps keys offline — secure but less convenient. Use both together.'
		},
		{
			question: 'Which wallet works with BitTasker?',
			answer:
				'Any Lightning-compatible wallet works for receiving payments — Blink, Aqua, Phoenix, and others. BitTasker also supports MetaMask, Ledger, Trezor, and WalletConnect for other payment flows.'
		},
		{
			question: 'Do I need a hardware wallet?',
			answer:
				'If your Bitcoin holdings are under a few hundred dollars, a self-custodial mobile wallet like Aqua is sufficient. As holdings grow past $500–$1000, investing in a hardware wallet becomes worthwhile.'
		},
		{
			question: 'What happens if I lose my hardware wallet?',
			answer:
				'Your Bitcoin is safe if you have your seed phrase backup. Buy a new hardware wallet and restore using your seed phrase. This is why steel backups are critical — they protect against device loss.'
		}
	],
	bitTaskerCta: {
		heading: 'Use Your Wallet to Earn on BitTasker',
		body: 'Whatever wallet you choose, BitTasker lets you receive freelance payments in Bitcoin over Lightning, on-chain, or via multi-chain escrow. Get paid directly to your wallet — no custodial intermediary.',
		buttonText: 'Start Freelancing with Bitcoin',
		buttonHref: '/auth/signup'
	}
};
