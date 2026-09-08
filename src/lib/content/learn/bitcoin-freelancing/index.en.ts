import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Freelancing: Earn BTC on Your Own Terms',
		subtitle:
			'Getting paid, job platforms, escrow, and payroll — everything about freelancing with Bitcoin.'
	},
	answerBlock:
		'Bitcoin freelancing lets you earn, hold, and spend Bitcoin for your work — without relying on traditional banks, payment processors, or centralized platforms. You get paid instantly via Lightning Network, your identity is a Nostr keypair you own, and escrow is enforced by audited smart contracts on RGB. This guide covers the full landscape: how to get paid in Bitcoin, the best platforms for crypto jobs, how trustless escrow works, and how crypto payroll is transforming global hiring. Whether you are a developer, designer, writer, or local service provider, the Bitcoin economy has work for you.',
	sections: [
		{
			heading: 'How do freelancers get paid in Bitcoin?',
			body: 'Freelancers receive Bitcoin through the Lightning Network — a Layer 2 protocol that enables instant, near-zero-fee transactions. When a client approves your completed work on a platform like BitTasker, satoshis are sent directly to your Lightning wallet. The process is straightforward: set up a Lightning-compatible wallet (Aqua, Blink, or Phoenix), complete work, and receive payment in seconds. There is no bank intermediary, no 3–5 day processing delay, and transaction fees under a cent. You can hold Bitcoin as savings, convert to local currency through exchanges, or spend it directly at merchants accepting BTC. Our "Get Paid in Bitcoin" guide walks through every step in detail.'
		},
		{
			heading: 'What are the best Bitcoin job platforms in 2026?',
			body: 'The Bitcoin freelancing ecosystem includes several platforms. BitTasker focuses on the Latin American market with Nostr identity, RGB escrow, and Lightning payouts — charging 5% with tiered loyalty rewards. LaborX offers a broad marketplace for Bitcoin-paying jobs across development, design, and creative work. CryptoJobsList aggregates remote crypto job listings. AngelList hosts startup roles that sometimes pay in Bitcoin. Bitwage lets you receive any salary in Bitcoin, even from traditional employers. For the best combination of low fees, fast payments, and decentralized identity, BitTasker is purpose-built for Bitcoin freelancing. Our Bitcoin jobs guide compares every platform in detail.'
		},
		{
			heading: 'How does Bitcoin escrow work for freelancers?',
			body: "Bitcoin escrow protects both freelancers and clients by locking funds in a smart contract until work is completed and approved. On BitTasker, escrow uses RGB smart contracts merged-mined with Bitcoin for security. When a client funds a project, the payment goes into a smart contract — not BitTasker's bank account. The contract enforces agreed terms: funds release when milestones are approved, or return to the client if the project is cancelled. Disputes follow transparent resolution rules coded into the contract. No single party — including BitTasker — can move the funds unilaterally. This is fundamentally different from traditional platform escrow, where the company controls the money. Our Bitcoin escrow guide explains every aspect of the mechanism."
		},
		{
			heading: 'How does crypto payroll work for paying teams in Bitcoin?',
			body: 'Crypto payroll lets companies pay employees and contractors in Bitcoin, stablecoins, or other cryptocurrencies. Services like Bitwage handle the conversion from fiat payroll to Bitcoin, allowing traditional employers to pay part or all of a salary in BTC. Native Bitcoin companies pay directly in BTC or Lightning. For international teams, crypto payroll eliminates wire transfer fees, FX markups, and multi-day settlement delays. A company in the US can pay a contractor in Argentina in minutes — no correspondent banks, no 3–5 day hold. Our crypto payroll guide covers the tools, tax implications, and implementation strategies.'
		},
		{
			heading: 'How do you start earning Bitcoin as a freelancer?',
			body: 'Step 1: Set up a Lightning wallet. Download Aqua, Blink, or Wallet of Satoshi — free on iOS and Android. Step 2: Secure your seed phrase. Write it on paper (better: steel backup) and store it safely. Step 3: Create a BitTasker account using your Nostr identity. Step 4: Browse available tasks and apply. Step 5: Complete the work and submit for review. Step 6: When the client approves, payment arrives in your wallet via Lightning in seconds. Step 7: Hold Bitcoin as savings, convert to local currency, or spend directly. The entire process — from signup to first payment — can take less than a day. No bank account required, no credit check, no waiting period.'
		},
		{
			heading: 'How does Bitcoin freelancing compare to traditional freelancing?',
			body: 'Traditional freelancing platforms (Upwork, Fiverr) charge 10–20% in fees, hold your funds for 14 days, require bank accounts, and control your identity and reputation. Bitcoin freelancing charges 5–10% (BitTasker), pays instantly via Lightning, works with a self-custodial wallet, and gives you portable identity through Nostr. The tradeoffs: Bitcoin freelancing requires comfort with crypto wallets, the ecosystem is smaller, and price volatility affects earnings. But for freelancers in emerging markets — Latin America, Africa, Southeast Asia — the benefits are significant: no banking friction, no remittance fees, no platform censorship, and instant access to global clients.'
		}
	],
	faq: [
		{
			question: 'Can I really earn Bitcoin as a freelancer?',
			answer:
				'Yes. Platforms like BitTasker, LaborX, and CryptoJobsList connect freelancers with clients who pay in Bitcoin. Common categories include development, design, writing, translation, and local services. Earnings range from $500–$1,500/month part-time to $3,000–$8,000+/month full-time.'
		},
		{
			question: 'What skills pay the most in Bitcoin?',
			answer:
				'Software development (web, mobile, smart contracts) commands the highest rates — $75–$150/hour on crypto-native platforms. UI/UX design, content writing, and translation are also in high demand. Developers with Lightning or Nostr experience earn premium rates.'
		},
		{
			question: 'Do I need a bank account to earn Bitcoin?',
			answer:
				'No. You need a Lightning wallet (Aqua, Blink, or Phoenix) — free on iOS and Android. Payments arrive directly in your wallet via Lightning. If you want to convert to local currency, you can use exchanges or peer-to-peer services.'
		},
		{
			question: 'How do I protect my Bitcoin earnings?',
			answer:
				'Use a two-tier wallet approach: a mobile Lightning wallet for receiving payments, and a hardware wallet (Coldcard, Trezor) for long-term savings. Back up your seed phrase on steel. Never share your private keys. For platform security, BitTasker uses RGB escrow — your funds are locked in smart contracts, not company bank accounts.'
		},
		{
			question: "What happens if Bitcoin's price drops?",
			answer:
				'Bitcoin is volatile. To mitigate risk, you can convert earnings to stablecoins (USDC) or local currency immediately after receiving payment. Some freelancers hold a percentage in Bitcoin as long-term savings while converting the rest.'
		},
		{
			question: 'Is Bitcoin freelancing legal?',
			answer:
				'Receiving payment in Bitcoin is legal in most jurisdictions. Tax obligations apply — you must report income regardless of the payment method. Consult a tax professional in your jurisdiction for specific guidance.'
		},
		{
			question: 'How does escrow protect me as a freelancer?',
			answer:
				'BitTasker uses RGB smart contracts for escrow. Your payment is locked in code until the client approves the work. Neither the client, BitTasker, nor any third party can move the funds unilaterally. Disputes follow transparent, on-chain resolution rules.'
		}
	],
	bitTaskerCta: {
		heading: 'Start Earning Bitcoin Today',
		body: 'BitTasker connects you with clients who pay instantly via Lightning. Lower fees than Upwork or Fiverr, faster payments, and you own your identity through Nostr.',
		buttonText: 'Sign Up Free',
		buttonHref: '/auth/signup'
	}
};
