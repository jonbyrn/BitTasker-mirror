import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Nostr Wallet Connect: How NWC Works Explained',
		subtitle:
			'The protocol that lets Bitcoin wallets communicate with any Nostr app — no custodial accounts needed'
	},
	answerBlock:
		'Nostr Wallet Connect (NWC) is an open protocol that allows any Bitcoin wallet to connect to any Nostr application through encrypted, permissioned communication. Instead of creating separate accounts on every platform, you connect your wallet once and grant specific permissions — pay an invoice, check a balance, or list transactions — to any Nostr app you authorize. NWC works by creating an encrypted relay connection between your wallet (which runs an NWC service) and the app (which acts as a client). You control exactly what each app can do. Your keys never leave your wallet. NWC is built on the Nostr protocol, which is already the identity layer for BitTasker, meaning your Nostr identity doubles as your wallet connection.',
	sections: [
		{
			heading: 'What is Nostr Wallet Connect?',
			body: 'Nostr Wallet Connect (NWC) is a standardized protocol (NIP-47) that bridges Bitcoin wallets and Nostr applications. Think of it as a universal plug for Bitcoin payments: instead of each app building custom wallet integrations, they all speak the same NWC language. Your wallet acts as a server that listens for payment requests. The app acts as a client that sends requests (pay this invoice, check this balance) through an encrypted Nostr relay. The connection is authenticated with a keypair — the wallet holds the private key, and the app receives a limited-access public key. You grant specific permissions (e.g., "this app can pay invoices up to 10,000 sats") and revoke them at any time. This is fundamentally different from custodial platforms, where your funds sit in the platform\'s wallet.'
		},
		{
			heading: 'How does NWC work technically?',
			body: 'NWC uses three components: a wallet service, a Nostr relay, and a client app. The wallet service runs on your device or a server you control, implementing the NIP-47 specification. It listens for encrypted Nostr events on a specific relay. The client app (any Nostr application) connects to the same relay using a connection string (a nostr+walletconnect:// URI containing the relay URL and encryption keys). When the app wants to pay an invoice, it creates an encrypted Nostr event containing the invoice, signs it with the client key, and publishes it to the relay. The wallet service picks up the event, decrypts it, verifies the client key has permission, and executes the payment. The response (success or failure) is sent back through the relay as another encrypted event. At no point does the app have access to your private keys or seed phrase.'
		},
		{
			heading: 'Which wallets support Nostr Wallet Connect?',
			body: 'NWC support is growing rapidly. Wallets with native NWC support include Mutiny Wallet, Coinos, Aqua Wallet, Primal, and Cashu-based wallets. Lightning wallet implementations like LND, CLN (Core Lightning), and LNbits can run NWC services. BlueWallet and Phoenix are adding NWC support. For hardware wallet users, you can run an NWC service on a node connected to your Coldcard or Ledger via Sparrow Wallet. The beauty of NWC is that any wallet implementing NIP-47 can connect to any NWC-compatible app — the ecosystem is interoperable by design. On BitTasker, NWC is the primary mechanism for connecting your wallet to the platform.'
		},
		{
			heading: 'How do you set up Nostr Wallet Connect step by step?',
			body: 'Step 1: Choose an NWC-compatible wallet (Mutiny, Coinos, Aqua, or a self-hosted LND/CLN node). Step 2: In your wallet settings, find "Nostr Wallet Connect" or "NWC" and create a new connection. Step 3: The wallet generates a connection string (nostr+walletconnect://...). Copy this string. Step 4: In the Nostr app you want to connect (BitTasker, Primal, Amethyst), find the "Connect Wallet" option and paste the connection string. Step 5: Review the permissions the app is requesting (e.g., "pay invoices up to X sats"). Approve only what you\'re comfortable with. Step 6: Test with a small payment to verify the connection works. You can revoke access at any time from your wallet\'s NWC settings.'
		},
		{
			heading: 'What are the security implications of NWC?',
			body: 'NWC is designed with several security layers. First, all communication is encrypted end-to-end using Nostr keys — relay operators cannot read your payment data. Second, you grant granular permissions: an app might only be able to pay invoices up to a certain amount, not withdraw your entire balance. Third, your seed phrase and private keys never leave your wallet — the app only receives a limited-access keypair. Fourth, you can revoke any connection instantly from your wallet settings. The main risk is approving a malicious app with overly broad permissions. Always review permission requests carefully and start with minimal amounts. If an NWC connection is compromised, the attacker can only do what the permissions allow — they cannot drain your entire wallet.'
		},
		{
			heading: 'How does NWC compare to other wallet connection methods?',
			body: "Traditional wallet connections require building custom integrations for each platform — a website might use Web3 modal, an app might use deep links, and each requires different code. NWC is a single standard that works across all Nostr apps. Compared to custodial logins (email + password), NWC is self-custodial — you own the keys. Compared to raw Lightning invoice payments, NWC adds persistent connections with permissioned access. Compared to on-chain QR code payments, NWC supports automatic, app-initiated payments without manual scanning. For the Nostr ecosystem, NWC is what OAuth is to web apps — a standardized authorization protocol — except your funds stay in your wallet, not a platform's database."
		},
		{
			heading: 'How does NWC work with BitTasker?',
			body: "BitTasker uses NWC as the primary wallet connection method. When you sign up, you connect your NWC-compatible wallet to your Nostr identity. When a client hires you and funds escrow, the Bitcoin is locked in a smart contract — not in BitTasker's wallet. When you complete the work and the client releases payment, the funds flow directly to your NWC-connected wallet via Lightning. This means BitTasker never custodies your earnings. Your Nostr identity, wallet connection, and payment flow are all integrated through open protocols. No accounts to freeze, no withdrawal delays, no platform risk."
		}
	],
	faq: [
		{
			question: 'Is Nostr Wallet Connect safe?',
			answer:
				'Yes, NWC is designed with end-to-end encryption and granular permissions. Your keys never leave your wallet, and you control exactly what each app can do. Always review permission requests and start with small amounts.'
		},
		{
			question: 'Does BitTasker support NWC?',
			answer:
				'Yes, NWC is the primary wallet connection method on BitTasker. Connect an NWC-compatible wallet to receive payments directly when clients release escrow.'
		},
		{
			question: 'Which wallets work with NWC?',
			answer:
				'Mutiny Wallet, Coinos, Aqua Wallet, Primal, and Cashu-based wallets have native NWC support. LND, CLN, and LNbits can run NWC services. More wallets are adding support.'
		},
		{
			question: 'Can I revoke NWC access?',
			answer:
				"Yes, you can revoke any NWC connection instantly from your wallet's settings. The app loses all access immediately."
		},
		{
			question: 'Do I need a Nostr account to use NWC?',
			answer:
				"NWC uses Nostr keypairs for authentication, but you don't need a public Nostr social profile. The keypair is used solely for encrypted wallet communication."
		},
		{
			question: 'What are the fees for using NWC?',
			answer:
				'NWC itself has no fees — it is an open protocol. Standard Lightning network fees apply to payment routing, just like any Lightning transaction.'
		},
		{
			question: 'Can I use NWC with a hardware wallet?',
			answer:
				'Yes, by running an NWC service on a node connected to your hardware wallet via Sparrow Wallet or a similar companion app. The NWC service handles payment routing while your hardware wallet secures the keys.'
		}
	],
	bitTaskerCta: {
		heading: 'Connect Your Wallet to BitTasker via NWC',
		body: 'NWC is how BitTasker connects to your wallet. Link your NWC-compatible wallet to start receiving Bitcoin payments directly — no custodial accounts, no withdrawal delays.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Connect a Wallet via Nostr Wallet Connect',
		description:
			'Step-by-step guide to connecting your Bitcoin wallet to Nostr apps using the NWC protocol.',
		totalTime: 'PT10M',
		steps: [
			{
				name: 'Ensure your wallet supports NWC',
				text: 'Verify that your wallet has Nostr Wallet Connect support. Compatible wallets include Mutiny Wallet, Coinos, Aqua Wallet, and wallets running LND or Core Lightning with NWC enabled.'
			},
			{
				name: 'Generate NWC connection string',
				text: 'In your wallet settings, find the NWC option and create a new connection. The wallet generates a nostr+walletconnect:// URI containing the relay URL and encryption keys.'
			},
			{
				name: 'Paste into Nostr app',
				text: 'In the Nostr app you want to connect (BitTasker, Primal, Amethyst), find the Connect Wallet option and paste the NWC connection string.'
			},
			{
				name: 'Grant permissions',
				text: 'Review the permissions the app is requesting — such as pay invoices up to a certain amount. Approve only what you are comfortable with and set appropriate spending limits.'
			},
			{
				name: 'Test with small payment',
				text: "Send a small test payment through the app to verify the connection works correctly. You can revoke access at any time from your wallet's NWC settings."
			}
		]
	}
};
