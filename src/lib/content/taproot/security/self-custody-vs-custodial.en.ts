import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Self-Custody vs Custodial Bitcoin Wallets',
		subtitle: 'Understand the tradeoffs between holding your own keys and trusting a third party'
	},
	answerBlock:
		'Self-custody means you control your Bitcoin private keys — no company, exchange, or third party can access, freeze, or lose your funds. Custodial means someone else (an exchange, bank, or wallet provider) holds your keys and controls your access to Bitcoin. The core principle is "not your keys, not your coins" — if you don\'t control the private keys, you don\'t truly own the Bitcoin. Self-custody offers maximum freedom and security but requires personal responsibility. Custodial is more convenient but introduces counterparty risk — the platform can be hacked, go bankrupt, or freeze your account. Most experienced Bitcoiners use self-custody for savings and a lightweight custodial or self-custodial wallet for daily spending.',
	sections: [
		{
			heading: 'What is self-custody and how does it work?',
			body: 'Self-custody means you generate and store your own Bitcoin private keys using a wallet (hardware or software). Your keys never leave your control. When you create a wallet, you receive a seed phrase (typically 24 words) that derives all your private keys. This seed phrase IS your Bitcoin — anyone who has it can spend your funds. With self-custody, you are responsible for: generating and securing your seed phrase, backing it up safely (steel backup, geographic separation), protecting it from theft, loss, and damage, and managing your own transactions. Tools that enable self-custody include hardware wallets (Coldcard, Trezor, BitBox, Passport) for maximum security, and software wallets (Sparrow, Aquawallet) for convenience. Your Bitcoin lives on the blockchain; your wallet stores the keys that authorize spending it.'
		},
		{
			heading: 'What is custodial Bitcoin and how does it work?',
			body: 'Custodial means a third party holds your Bitcoin private keys on your behalf. When you buy Bitcoin on Coinbase, Binance, or Cash App and leave it there, those platforms hold your keys. You trust them to safeguard your funds and honor withdrawal requests. Custodial services include exchanges (Coinbase, Binance, Kraken), custodial wallets (Cash App, Robinhood, PayPal), and Lightning wallets (Blink Wallet, Strike). The tradeoff is clear: custodial is convenient (no seed phrase to manage, account recovery possible, easy fiat on-ramp) but introduces significant risk. The platform can be hacked, go bankrupt (Mt. Gox, FTX), freeze your account, or be compelled by governments to seize your funds. You are trusting a company — and companies fail.'
		},
		{
			heading: 'What are the pros and cons of self-custody?',
			body: 'Pros: Maximum security — no third party can hack, freeze, or lose your keys. Complete control — no one can prevent you from spending your Bitcoin. censorship resistance — no government or company can seize your funds. Privacy — no KYC required for basic self-custody. True ownership — "not your keys, not your coins" is resolved in your favor. Cons: Personal responsibility — if you lose your seed phrase, your Bitcoin is gone forever. No account recovery. Learning curve — requires understanding seed phrases, wallets, and security practices. Inconvenience — slightly slower than custodial for daily use. Physical security — you must protect your seed phrase from fire, theft, and damage.'
		},
		{
			heading: 'What are the pros and cons of custodial Bitcoin?',
			body: 'Pros: Convenience — no seed phrase to manage, simple login with email/password. Account recovery — if you forget your password, you can reset it. Fiat integration — easy to buy, sell, and convert to local currency. Customer support — a company handles issues for you. Simplicity — ideal for beginners who are overwhelmed by self-custody. Cons: Counterparty risk — the platform can be hacked, go bankrupt, or freeze your account. History shows this is not theoretical: Mt. Gox (2014, 850,000 BTC lost), QuadrigaCX (2019, $190M lost), FTX (2022, $8B customer funds lost). Not your keys, not your coins — you are trusting a company with your wealth. KYC and surveillance — custodial platforms collect your identity, transaction history, and personal data. Withdrawal restrictions — platforms can delay or block withdrawals during high-traffic periods.'
		},
		{
			heading: "What does 'not your keys, not your coins' mean?",
			body: "This phrase encapsulates the fundamental principle of Bitcoin ownership. When you hold Bitcoin on a custodial platform, you have an IOU — a promise from the company to pay you Bitcoin when you request it. You do not control the private keys that authorize spending on the blockchain. If the company goes bankrupt, gets hacked, or decides to freeze your account, your Bitcoin is inaccessible. When you hold Bitcoin in a self-custodial wallet, you control the private keys. Your Bitcoin is secured by cryptography, not by a company's promises. You can spend it anytime without anyone's permission. This is the revolutionary property of Bitcoin: the ability to be your own bank. Self-custody is not just a technical choice — it is the realization of Bitcoin's original promise of financial sovereignty."
		},
		{
			heading: 'When should you use self-custody vs custodial?',
			body: 'Use self-custody for: long-term savings (any amount you cannot afford to lose), Bitcoin you plan to hold for months or years, amounts above $500 that represent meaningful wealth, and when you want maximum privacy and censorship resistance. Use custodial for: small daily spending amounts (under $100), when you are just learning about Bitcoin and not yet comfortable with seed phrase management, quick fiat-to-Brypto conversions, and Lightning payments where convenience matters (Blink Wallet in El Salvador). The optimal strategy for most people: keep savings on a hardware wallet (self-custody), keep spending money on a mobile wallet (self-custodial like Aqua, or custodial like Blink for convenience), and use exchanges only for buying/selling — never for long-term storage.'
		},
		{
			heading: 'How does BitTasker support self-custody?',
			body: 'BitTasker is built on self-custody principles. Your identity is a Nostr keypair you control — not an email/password in a company database. Payments flow via Lightning Network directly to your connected wallet. The platform never custodies your funds. For escrow, RGB smart contracts lock Bitcoin in code, not in a company bank account. This means BitTasker operates as a self-custodial-first platform: you control your identity, your keys, and your funds. The tradeoff is responsibility — you must manage your seed phrase securely. But the benefit is freedom: no account freezes, no withdrawal delays, no counterparty risk from the platform itself.'
		}
	],
	faq: [
		{
			question: 'What does "not your keys, not your coins" mean?',
			answer:
				"It means if you don't control the private keys to your Bitcoin, you don't truly own it. Custodial platforms hold your keys and can freeze, lose, or steal your funds. Self-custody gives you full control and responsibility."
		},
		{
			question: 'Is self-custody more secure than custodial?',
			answer:
				'Self-custody eliminates counterparty risk (exchange hacks, bankruptcy, account freezes) but shifts responsibility to you. A well-secured hardware wallet with a steel backup is more secure than any custodial platform. A poorly managed seed phrase is less secure than a reputable exchange.'
		},
		{
			question: 'What happens if I lose my seed phrase with self-custody?',
			answer:
				'Your Bitcoin is permanently irrecoverable. There is no account recovery, no customer support, no password reset. This is why steel backups, geographic separation, and BIP39 passphrases are critical. Treat your seed phrase as the most valuable thing you own.'
		},
		{
			question: 'Can a custodial exchange freeze my Bitcoin?',
			answer:
				'Yes. Custodial platforms can freeze your account for compliance reasons, suspicious activity, or at the request of law enforcement. With self-custody, no one can prevent you from spending your Bitcoin.'
		},
		{
			question: 'Which is better for beginners?',
			answer:
				'Start with a custodial wallet like Blink for convenience while learning. As you become comfortable, graduate to self-custody with a hardware wallet for savings. The transition from custodial to self-custody is a natural progression.'
		},
		{
			question: 'Does BitTasker hold my Bitcoin?',
			answer:
				'No. BitTasker uses Nostr identity (you control your keys) and Lightning payments (funds flow directly to your wallet). Escrowed funds are locked in RGB smart contracts, not BitTasker bank accounts.'
		},
		{
			question: 'What is the difference between self-custodial and custodial Lightning wallets?',
			answer:
				'A self-custodial Lightning wallet (Aqua, Mutiny) gives you control of your channel keys. A custodial Lightning wallet (Blink, Strike) manages channels for you — simpler but with counterparty risk.'
		}
	],
	bitTaskerCta: {
		heading: 'Self-Custody Freelancing with BitTasker',
		body: 'BitTasker is built for self-custody. Your Nostr identity, your keys, your wallet, your Bitcoin. No custodial intermediary between you and your earnings.',
		buttonText: 'Start Freelancing',
		buttonHref: '/auth/signup'
	}
};
