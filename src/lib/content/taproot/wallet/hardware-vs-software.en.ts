import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Hardware vs Software Wallets: Which Do You Need?',
		subtitle:
			'Understand the security trade-offs, costs, and use cases for hardware and software Bitcoin wallets.'
	},
	answerBlock: `Hardware wallets store your Bitcoin private keys on an offline physical device, providing superior security against online attacks, malware, and remote hacking. They cost $100–$350 and are ideal for long-term savings above $1,000. Software wallets run as apps on your phone or computer, offering convenience and free access but with higher risk since they're connected to the internet. For most Bitcoin users, the optimal strategy is a hybrid approach: a hardware wallet for long-term cold storage and a software wallet for everyday spending, Lightning payments, and escrow on platforms like BitTasker. Hardware wallets like Coldcard, Foundation Passport, and BitBox02 protect your keys from remote attacks through air-gapped signing and secure elements, while software wallets like Aqua or Blink provide the speed and convenience needed for daily Bitcoin transactions.`,
	sections: [
		{
			heading: 'What is a hardware wallet and how does it work?',
			body: `A hardware wallet is a physical device designed to store and manage Bitcoin private keys in an offline environment. Unlike software wallets that run on internet-connected phones or computers, hardware wallets keep your keys on a dedicated chip that never connects directly to the network. When you want to send Bitcoin, the hardware wallet receives an unsigned transaction from a companion app (via USB, MicroSD, or QR code), displays the transaction details on its screen for verification, signs it internally using your private key, and sends the signed transaction back to the companion app for broadcasting. At no point does the private key leave the hardware wallet's secure element. This air-gapped architecture means that even if your computer is infected with malware, your Bitcoin keys remain safe. Hardware wallets typically cost between $100 and $350, use secure elements (specialized chips rated EAL5+ or higher), and support BIP39 seed phrases for backup and recovery. Major manufacturers include Coinkite (Coldcard), Foundation Devices (Passport), Shift Crypto (BitBox02), Ledger, and Trezor.`
		},
		{
			heading: 'What is a software wallet and how does it work?',
			body: `A software wallet is an application that runs on your phone, computer, or browser and stores Bitcoin private keys as encrypted data on the device's storage. Popular software wallets include Aquawallet, Blink, BlueWallet, Sparrow Wallet, and Electrum. Software wallets generate and store your seed phrase digitally (encrypted with a password), create and sign transactions using the device's processor, and broadcast them to the Bitcoin network via connected nodes. The primary advantage is convenience — you can send and receive Bitcoin instantly, manage Lightning payments, interact with DeFi protocols, and access your funds from anywhere with an internet connection. However, this connectivity is also the main risk: software wallets are exposed to malware, phishing attacks, screen recorders, keyloggers, and operating system vulnerabilities. If your phone or computer is compromised, an attacker could potentially extract your private keys. Software wallets are free to use and range from beginner-friendly mobile apps (Aqua, Blink) to advanced desktop tools (Sparrow, Electrum). They're best suited for everyday spending with smaller amounts you can afford to lose.`
		},
		{
			heading: 'How do hardware and software wallets compare on security?',
			body: `The fundamental security difference comes down to the attack surface. A hardware wallet's attack surface is extremely narrow — an attacker would need physical access to the device, knowledge of your PIN, and specialized equipment to extract keys from the secure element. Remote attacks are essentially impossible because the device never connects to the internet. A software wallet's attack surface is much broader: malware on your phone or computer, phishing websites that mimic real wallets, SIM swapping to bypass 2FA, screen recording apps, clipboard hijacking that replaces your recipient address, and supply chain attacks on app stores. That said, modern software wallets have improved significantly — many now support air-gapped QR code signing, multi-signature setups, and hardware wallet integration. The security also depends heavily on user behavior: a carefully maintained software wallet on a dedicated device can be quite secure, while a hardware wallet used carelessly (weak PIN, no passphrase, seed phrase stored digitally) can still be compromised. For amounts above $1,000 that you plan to hold long-term, a hardware wallet is strongly recommended. For smaller daily spending amounts, a well-configured software wallet provides adequate security.`
		},
		{
			heading: 'When should you use a hardware wallet?',
			body: `A hardware wallet is the right choice when you're storing Bitcoin you don't plan to spend in the near term — your savings, emergency fund, or long-term investment. The general rule of thumb is: if the amount exceeds what you'd be comfortable losing, it belongs on a hardware wallet. Specific scenarios where a hardware wallet is essential include: holding Bitcoin for retirement or multi-year time horizons, protecting savings from exchange collapses (after FTX, self-custody is no longer optional for serious holders), securing business treasury funds in Bitcoin, and protecting inherited or gifted Bitcoin. Hardware wallets are also valuable if you live in an area with elevated physical security risks, since features like duress PINs (Coldcard) and encrypted backups (BitBox02) provide additional protection layers. If you earn Bitcoin through freelancing or business on platforms like BitTasker, moving your accumulated earnings to a hardware wallet on a regular schedule is a best practice. The cost of a hardware wallet ($100-$350) is a small price to pay for the security of amounts that could represent months or years of earnings.`
		},
		{
			heading: 'When should you use a software wallet?',
			body: `Software wallets are ideal for Bitcoin you plan to use actively — everyday spending, Lightning payments, receiving payments from clients, and interacting with Bitcoin-native applications. If you use Bitcoin for daily transactions (buying coffee, paying for services, tipping), a software wallet on your phone provides the speed and convenience that hardware wallets can't match. Software wallets are also essential for: Lightning Network transactions (hardware wallets generally don't support Lightning), receiving payments on the go (you can share a receive address without carrying hardware), testing and learning Bitcoin (start with small amounts in a software wallet before investing in hardware), and operating in regions where hardware wallet shipping is unreliable. For freelancers and gig workers on BitTasker, a software wallet serves as the active spending layer — receiving payments, paying for services, and managing Lightning channels. The key is to treat your software wallet like a checking account: keep only what you need for the coming weeks or months, and sweep excess funds to your hardware wallet "savings account" regularly. Most software wallets are free, so there's no cost barrier to getting started.`
		},
		{
			heading: 'How do you use hardware and software wallets together?',
			body: `The most secure and practical Bitcoin storage strategy uses both hardware and software wallets in a layered approach. Think of it like your traditional bank accounts: a checking account for daily spending and a savings account for long-term storage. Your hardware wallet is the savings account — it holds the bulk of your Bitcoin in cold storage, protected by secure elements and air-gapped signing. Your software wallet is the checking account — it holds a small working balance for everyday transactions, Lightning payments, and platform escrow. The workflow is straightforward: when you receive Bitcoin (from BitTasker earnings, mining, or purchases), you store the majority in your hardware wallet and keep a smaller amount in your software wallet for active use. When you need to replenish your software wallet, you transfer from the hardware wallet. When your software wallet accumulates more than you need, you sweep it back to cold storage. This hybrid approach gives you the best of both worlds: the ironclad security of hardware for long-term storage, and the convenience and speed of software for daily Bitcoin use. It's the strategy recommended by most Bitcoin security experts and is the natural choice for anyone serious about protecting their Bitcoin while still using it actively.`
		},
		{
			heading: 'How does BitTasker work with both hardware and software wallets?',
			body: `BitTasker is designed to work seamlessly with both hardware and software Bitcoin wallets. When you earn Bitcoin on the platform — whether through freelancing gigs, task completion, or escrow releases — you can receive payments to any Bitcoin address your wallet generates. For daily platform activity (accepting tasks, managing escrow, receiving instant payments), a software wallet like Aqua or Blink provides the convenience you need. These wallets support Lightning Network, which BitTasker uses for fast, low-fee micro-payments between users. For securing your accumulated earnings, you can transfer Bitcoin from your software wallet to a hardware wallet like Coldcard, Passport, or BitBox02 for long-term cold storage. The platform's escrow system works with both wallet types — when a client releases escrowed funds, the Bitcoin arrives at whatever address you've provided, whether it's a software wallet for immediate access or a hardware wallet address for cold storage. This flexibility means you're never forced into a single storage method. The recommended workflow for BitTasker users: keep a software wallet for active earning and spending, and regularly sweep profits to a hardware wallet for secure long-term holding.`
		}
	],
	faq: [
		{
			question: 'Are hardware wallets worth the money?',
			answer: `For anyone holding more than $1,000 in Bitcoin, a hardware wallet is absolutely worth the investment. A $150 Coldcard or $129 BitBox02 protecting thousands of dollars in Bitcoin is a small price for peace of mind. The cost is typically less than 1% of the value it protects, and it eliminates the risk of losing your savings to online attacks, exchange failures, or device theft.`
		},
		{
			question: 'Can a hardware wallet be hacked?',
			answer: `While no system is 100% immune, hardware wallets are extremely resistant to hacking. An attacker would need physical access to the device, knowledge of your PIN, and specialized laboratory equipment to extract keys from the secure element. Remote hacking is essentially impossible due to the air-gapped design. The primary risk is social engineering — being tricked into entering your seed phrase on a fake website or device.`
		},
		{
			question: 'Are software wallets safe for Bitcoin?',
			answer: `Software wallets provide adequate security for smaller amounts you use regularly, but they're more vulnerable than hardware wallets. Risks include malware, phishing, and device compromise. For amounts above $1,000 or long-term savings, a hardware wallet is strongly recommended. For everyday spending with smaller amounts, a well-configured software wallet (strong password, updated device, no rooting) is reasonable.`
		},
		{
			question: 'Which is better for beginners: hardware or software wallet?',
			answer: `Start with a free software wallet like Aqua or Blink to learn how Bitcoin works with small amounts. Once you're comfortable and your holdings grow beyond a few hundred dollars, invest in a hardware wallet like the BitBox02 ($129) for its user-friendly setup and microSD backup. This graduated approach minimizes risk while you learn.`
		},
		{
			question: 'Do I need both a hardware and software wallet?',
			answer: `For most Bitcoin users, yes. A software wallet handles daily spending and Lightning payments, while a hardware wallet secures your long-term savings. This layered approach gives you convenience for everyday use and ironclad security for the amounts you can't afford to lose.`
		},
		{
			question: 'What happens if my hardware wallet breaks?',
			answer: `Your Bitcoin is safe as long as you have your backup — either a 24-word seed phrase or an encrypted microSD backup (for BitBox02). Simply purchase a new hardware wallet (or any BIP39-compatible wallet) and recover using your backup. The hardware wallet is just a signing device; your funds are derived from the seed, not stored exclusively on the device.`
		},
		{
			question: 'Can I use BitTasker with just a software wallet?',
			answer: `Yes, BitTasker works perfectly with software wallets. You can receive Lightning payments, manage escrow, and withdraw earnings to any Bitcoin address. However, for long-term security, we recommend moving accumulated earnings to a hardware wallet periodically.`
		}
	],
	bitTaskerCta: {
		heading: 'Start earning Bitcoin with the right wallet setup',
		body: `BitTasker works with both hardware and software wallets. Start earning with a software wallet for daily transactions, then secure your profits with a hardware wallet for long-term cold storage.`,
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
