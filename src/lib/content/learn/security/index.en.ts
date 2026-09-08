import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Security & Trust: Protect Your Bitcoin Freelancing',
		subtitle:
			'Wallet security, scam prevention, self-custody, and trust signals — everything you need to stay safe.'
	},
	answerBlock:
		'Security is the foundation of earning and holding Bitcoin. This guide covers everything from wallet security and self-custody best practices to scam prevention and trust signals on freelancing platforms. Whether you are new to Bitcoin or a seasoned holder, understanding how to protect your private keys, verify platform trustworthiness, and avoid common attacks is essential. BitTasker is built on audited smart contracts and Nostr-based identity — but security starts with you. Learn the frameworks, tools, and habits that keep your Bitcoin safe.',
	sections: [
		{
			heading: 'Is BitTasker safe?',
			body: "BitTasker is built on three security pillars: RGB smart contract escrow merged-mined with Bitcoin, Nostr-based decentralized identity, and self-custodial Lightning payments. Escrow funds are locked in auditable smart contracts — not in BitTasker's bank account. Your identity is a cryptographic keypair you control, not an email/password tied to a central database. Payments flow directly to your wallet via Lightning. The platform charges a 5% fee and uses transparent, code-enforced rules. BitTasker cannot freeze your account or hold your funds hostage. However, crypto carries inherent risks: Bitcoin price volatility, smart contract execution risk, and transaction irreversibility. For a detailed breakdown, read our full analysis in the BitTasker security guide."
		},
		{
			heading: 'What are the fundamentals of wallet security?',
			body: 'Your wallet is your bank. Hardware wallets (Coldcard, Trezor, BitBox) store private keys offline in tamper-resistant chips — the gold standard for Bitcoin security. Software wallets (Sparrow, Electrum) offer advanced features for desktop users. Mobile wallets (Aqua, Blink) provide convenience for daily spending. The critical rule: never store more than spending money on a device connected to the internet. Use a two-tier approach: hardware wallet for savings, mobile wallet for spending. Always back up your seed phrase on steel (not paper), store it in a secure location, and never share it with anyone. For deeper comparisons, see our wallet security guide.'
		},
		{
			heading: 'How can Bitcoin freelancers prevent scams?',
			body: 'Bitcoin scams target freelancers through fake client offers, phishing links, and impersonation. Common attacks include: clients requesting off-platform payments (bypassing escrow protection), phishing emails disguised as platform notifications, fake wallet apps that steal seed phrases, and social engineering attacks on Nostr. The best defense: never move payments off-platform, verify wallet addresses through multiple channels, never share your seed phrase, and use hardware wallets for signing transactions. If a deal seems too good to be true, it is. Our avoid scams guide covers every major attack vector in detail.'
		},
		{
			heading: 'Self-custody vs. custodial: which is right for you?',
			body: 'Self-custody means you control your private keys — no company can freeze, lose, or confiscate your Bitcoin. Custodial services (exchanges, custodial wallets) hold your keys for you, offering convenience at the cost of trust. The Bitcoin ethos favors self-custody: "not your keys, not your coins." For freelancers, self-custody through Lightning wallets gives you instant access to earnings without relying on a third party. The tradeoff is responsibility — if you lose your seed phrase, your Bitcoin is gone forever. Our self-custody vs. custodial comparison helps you decide based on your technical comfort and holding size.'
		},
		{
			heading: 'What hardware security is needed for Bitcoin storage?',
			body: 'Hardware wallets are physical devices that store your private keys in a secure element — never exposing them to the internet. Top options include Coldcard (air-gapped, Bitcoin-only, fully open source), Trezor (open source, touchscreen, altcoin support), BitBox (compact, microSD backup), and Foundation Passport (QR-based air-gapped signing). For maximum security, use a hardware wallet with a BIP39 passphrase and store your seed backup on steel. Hardware wallets protect against malware, phishing, and remote attacks — even if your computer is compromised, your keys remain safe on the device. Our hardware security guide provides detailed comparisons and setup instructions.'
		},
		{
			heading: "How does BitTasker's security compare to traditional platforms?",
			body: 'Traditional freelancing platforms (Upwork, Fiverr) custody your funds in company bank accounts — they can freeze accounts, delay withdrawals, and take 10–20% in fees. BitTasker uses decentralized escrow on RGB, self-custodial Lightning payments, and Nostr identity. Your funds exist in smart contracts, not corporate accounts. Your identity is a keypair, not an email/password. The comparison is stark: traditional platforms offer convenience and fiat support; BitTasker offers sovereignty, lower fees (5%), and instant payments. The choice depends on whether you prioritize custodial convenience or decentralized control.'
		}
	],
	faq: [
		{
			question: 'Is BitTasker safe for freelancers?',
			answer:
				'Yes. BitTasker uses audited RGB smart contracts for escrow, Nostr for identity, and Lightning for payments. Escrow funds are locked in code, not held by BitTasker. Your identity is a keypair you control. However, you are responsible for your own wallet security.'
		},
		{
			question: 'What is the most important security practice for Bitcoin?',
			answer:
				'Protecting your seed phrase. Store it on steel (fire and water resistant), in a secure location, and never share it with anyone. Use a hardware wallet for significant amounts. Your seed phrase is the master key to all your Bitcoin — lose it, and your funds are gone forever.'
		},
		{
			question: 'How do I avoid Bitcoin scams?',
			answer:
				'Never move payments off-platform. Never share your seed phrase. Verify wallet addresses through multiple channels. Use hardware wallets for signing. If a deal seems too good to be true, it is. Be skeptical of unsolicited offers and phishing attempts.'
		},
		{
			question: 'Should I use self-custody or a custodial wallet?',
			answer:
				'Self-custody gives you full control but requires responsibility. Custodial wallets are convenient but require trusting a third party. For significant Bitcoin holdings, self-custody with a hardware wallet is recommended. For small amounts, a custodial Lightning wallet may be acceptable.'
		},
		{
			question: 'Can BitTasker freeze my account?',
			answer:
				'No. BitTasker cannot freeze your Nostr identity or prevent you from receiving payments. Your identity is a cryptographic keypair you control. The platform can restrict access to its interface, but your wallet and payment capability remain intact.'
		},
		{
			question: 'What happens if BitTasker shuts down?',
			answer:
				"Your Bitcoin is safe. Escrowed funds are in RGB smart contracts, not BitTasker's bank account. Your Nostr identity and reputation data persist on decentralized relays. You can interact with the smart contracts directly or import your identity to another platform."
		}
	],
	bitTaskerCta: {
		heading: 'Freelance with Confidence on BitTasker',
		body: 'Audited smart contracts, Nostr identity, and self-custody payments protect your earnings. Learn the security practices that keep your Bitcoin safe, then start earning.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
