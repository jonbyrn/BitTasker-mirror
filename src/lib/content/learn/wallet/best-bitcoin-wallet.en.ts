import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Best Bitcoin Wallet in 2026: Complete Guide',
		subtitle: 'Compare hardware, mobile, and Lightning wallets to find the right one for your needs'
	},
	answerBlock:
		'The best Bitcoin wallet depends on how you use Bitcoin. For long-term savings, hardware wallets like Coldcard Mk5 ($150), Trezor Model T ($219), or BitBox02 ($149) offer air-gapped cold storage. For everyday mobile spending, Aqua Wallet (free, self-custodial) and Blink Wallet (free, custodial) dominate the Lightning and Liquid ecosystems. For large holdings with enterprise-grade security, Foundation Passport ($349) is a premium option. The right choice balances security, convenience, and cost. Most experienced Bitcoiners use at least two wallets: a hardware wallet for savings and a mobile wallet for spending.',
	sections: [
		{
			heading: 'What Is a Bitcoin Wallet and How Does It Work?',
			body: 'A Bitcoin wallet is software or hardware that stores your private keys — the cryptographic proof that you own your Bitcoin. It does not actually "hold" Bitcoin the way a leather wallet holds cash. Instead, your Bitcoin lives on the blockchain, and your wallet stores the keys that authorize spending it. When you send Bitcoin, your wallet signs the transaction with your private key and broadcasts it to the network. There are three main categories: hardware wallets (physical devices for cold storage), mobile wallets (phone apps for daily spending), and Lightning wallets (built for instant, low-fee payments). Understanding these categories is the first step to choosing the right wallet.'
		},
		{
			heading: 'Which hardware wallets are the best for Bitcoin in 2026?',
			body: 'Hardware wallets are the gold standard for securing large Bitcoin holdings. Coldcard Mk5 ($150) is the most security-focused, with air-gapped signing via NFC, no USB connection required, and full support for CoinJoin and multi-signature setups. Trezor Model T ($219) offers a touchscreen interface and supports multiple cryptocurrencies alongside Bitcoin. BitBox02 ($149) is a compact, well-designed device with microSD backup and easy setup. Foundation Passport ($349) is a premium option with QR-code-based air-gapped signing and a large display. Ledger Nano X ($149) supports the widest range of cryptocurrencies but uses a closed-source secure element. All hardware wallets keep your keys offline, protected from online attacks.'
		},
		{
			heading: 'What are the best mobile Bitcoin wallets for daily use?',
			body: 'Mobile wallets are optimized for spending Bitcoin on the go. Aqua Wallet is a self-custodial mobile wallet supporting Bitcoin, Liquid Network, and Lightning — making it the most versatile mobile option for users who want key control. Blink Wallet is custodial and Lightning-first, built for simplicity with a dollar-denominated balance, ideal for users in El Salvador and Latin America. Both are free to download. Electrum is a desktop-class mobile wallet popular with advanced users for its robust feature set and Lightning support. For most people, Aqua or Blink covers 90% of daily Bitcoin spending needs. Choose Aqua if you want self-custody; choose Blink if you want simplicity.'
		},
		{
			heading: 'Hardware Wallet vs Mobile Wallet: Which Do You Need?',
			body: 'The answer is both. Hardware wallets and mobile wallets serve complementary purposes. A hardware wallet (Coldcard, Trezor, BitBox) is for cold storage — keeping the bulk of your Bitcoin safe from online threats, exchange hacks, and malware. A mobile wallet (Aqua, Blink) is for hot storage — spending, receiving payments, and day-to-day transactions. The recommended approach: keep your savings on a hardware wallet, and transfer spending money to a mobile wallet as needed. This "savings account + checking account" model gives you both security and convenience. Never store your entire Bitcoin holdings on a mobile wallet — phones are regularly lost, stolen, or compromised.'
		},
		{
			heading: 'Which Bitcoin wallet is best for each use case?',
			body: 'Choose Coldcard Mk5 if you want the most secure Bitcoin-only hardware wallet with air-gapped signing. Choose Trezor Model T if you want a user-friendly hardware wallet that also supports altcoins. Choose BitBox02 if you want a compact, well-designed hardware wallet with easy backup. Choose Foundation Passport if you want premium QR-based air-gapped signing. Choose Aqua Wallet if you want a free self-custodial mobile wallet with Bitcoin, Liquid, and Lightning support. Choose Blink Wallet if you want the simplest Lightning wallet for everyday payments, especially in Latin America. Choose BitTasker Wallet if you want integrated Bitcoin escrow protection for freelance work.'
		},
		{
			heading: 'How Much Does a Bitcoin Wallet Cost?',
			body: 'Mobile wallets like Aqua and Blink are free. Hardware wallets range from $79 to $249 depending on the model and features. Coldcard Mk5 costs around $150. Trezor Model T is approximately $219. BitBox02 is priced at about $149. Foundation Passport retails for $349. Ledger Nano X is around $149. The cheapest option for serious security is the Coldcard Q ($215 with features that rival much more expensive devices). For most people, starting with a free mobile wallet like Aqua and adding a hardware wallet when savings grow beyond a few hundred dollars is the practical approach.'
		},
		{
			heading: 'How do you choose the right Bitcoin wallet?',
			body: 'Ask yourself three questions. First, what will you use it for? Savings requires a hardware wallet; daily spending needs a mobile wallet. Second, how much Bitcoin do you hold? Under $500 in spending money works fine on a mobile wallet. Significant savings belong on hardware. Third, do you need Lightning? If you are in El Salvador or making frequent small payments, yes — choose a wallet with Lightning support like Aqua or Blink. For the best overall setup, combine a Coldcard or BitBox for savings with Aqua Wallet for spending. This gives you maximum security for your wealth and maximum convenience for your daily transactions.'
		}
	],
	faq: [
		{
			question: 'What is the best Bitcoin wallet for beginners?',
			answer:
				'For beginners, Blink Wallet offers the simplest experience with its dollar-denominated balance and custodial model. Aqua Wallet is the best free self-custodial option if you want to control your keys from day one. Both are free and available on iOS and Android.'
		},
		{
			question: 'How much does a Coldcard wallet cost?',
			answer:
				'The Coldcard Mk5 costs approximately $150 USD. It is a Bitcoin-only hardware wallet with air-gapped signing and no touchscreen — optimized for security over convenience.'
		},
		{
			question: 'Are free Bitcoin wallets safe?',
			answer:
				'Free mobile wallets like Aqua and Blink are safe for everyday spending amounts. Aqua is self-custodial, meaning you control your keys. Blink is custodial. For large savings, always use a hardware wallet regardless of cost.'
		},
		{
			question: 'Can I store Bitcoin and Lightning in the same wallet?',
			answer:
				'Yes. Both Aqua Wallet and Blink Wallet support Lightning alongside on-chain Bitcoin. Aqua also supports Liquid Network, giving you three networks in one app.'
		},
		{
			question: 'What is the difference between a hot wallet and a cold wallet?',
			answer:
				'A hot wallet (mobile or desktop) is connected to the internet — convenient for spending but more vulnerable to online attacks. A cold wallet (hardware device) keeps keys offline — secure for long-term storage but less convenient for daily transactions. Use both together.'
		},
		{
			question: 'Which Bitcoin wallet works with BitTasker?',
			answer:
				'Any wallet that supports Lightning payments works with BitTasker. This includes Blink Wallet, Aqua Wallet, and most Lightning-compatible wallets. BitTasker also supports MetaMask, Ledger, Trezor, and WalletConnect for other payment flows.'
		},
		{
			question: 'Do I need a hardware wallet if I only have a small amount of Bitcoin?',
			answer:
				'Not necessarily. If your Bitcoin holdings are small (under a few hundred dollars), a free self-custodial mobile wallet like Aqua is sufficient. As your holdings grow, investing in a hardware wallet becomes worthwhile for the added security.'
		}
	],
	bitTaskerCta: {
		heading: 'Use Your Bitcoin Wallet to Earn on BitTasker',
		body: 'Whatever wallet you choose, BitTasker lets you receive freelance payments in Bitcoin over Lightning, on-chain, or via multi-chain escrow. Get paid directly to your wallet.',
		buttonText: 'Start Freelancing with Bitcoin',
		buttonHref: '/auth/signup'
	}
};
