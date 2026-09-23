import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Nostr Identity: Decentralized Login Without Email',
		subtitle:
			'How public/private key pairs replace passwords and give you true digital identity ownership.'
	},
	answerBlock:
		'Nostr is a decentralized social protocol that replaces traditional email/password login with public/private key pair authentication. Instead of creating accounts on centralized platforms that can be banned, censored, or deleted, Nostr gives you a cryptographic identity — a public key that acts as your username everywhere and a private key that only you control. No company, government, or platform can revoke your identity or lock you out. For freelancers, this means your reputation, history, and identity travel with you across platforms without being owned by any single service. BitTasker uses Nostr as its identity layer, so signing up requires only a key pair — no email, no phone number, no central authority that can say no.',
	sections: [
		{
			heading: 'What is Nostr?',
			body: "Nostr stands for \"Notes and Other Stuff Transmitted by Relays\" — a minimalist protocol for decentralized communication. Unlike traditional social networks where a company controls the servers, data, and accounts, Nostr separates these concerns. Clients create signed messages (events), and relays store and forward them. Your identity is a cryptographic key pair — not an account on someone's server. Anyone can run a relay, anyone can write a client, and no single point of failure exists. Nostr gained mainstream attention through Damus (iOS client) and the integration with Lightning Network for zaps (micropayments). The protocol's simplicity — it fits in a single specification document — is its greatest strength. There's no complex blockchain, no token economics, no mining. Just signed messages moving through a decentralized relay network."
		},
		{
			heading: 'How does Nostr replace email and password login?',
			body: "Traditional login requires an email, password, and trust that the platform won't be breached, censored, or shut down. Nostr replaces this with a key pair: your public key is your identity (like a username), and your private key is your authentication (like a password, but mathematical). When you sign up on a Nostr-compatible service, you generate a key pair locally on your device. Your public key is shared openly; your private key never leaves your device. Authentication happens through cryptographic signatures — the server verifies you own the private key without ever seeing it. No email verification, no password reset, no account recovery through customer support. This is both the protocol's strength (censorship resistance, portability) and its challenge (lose your private key, lose your identity forever)."
		},
		{
			heading: 'How do public and private key pairs work in Nostr?',
			body: 'A Nostr key pair consists of two mathematically linked values. The private key (nsec) is a random number you generate and keep secret — it\'s the only way to prove you own your identity. The public key (npub) is derived from the private key and can be shared freely — it\'s how others identify and communicate with you. Think of the private key as the master key to your digital identity and the public key as your mailbox address. Anyone can send you a message (using your public key), but only you can sign responses (using your private key). In practice, key pairs are represented as alphanumeric strings: your public key starts with "npub1..." and your private key with "nsec1...". Key management is critical — if your private key is compromised, someone else can impersonate you. If it\'s lost, there\'s no recovery mechanism.'
		},
		{
			heading: 'What are NIPs (Nostr Implementation Possibilities)?',
			body: "NIPs are the specification documents that extend Nostr's core functionality. The base protocol (NIP-01) defines simple text notes and basic relay communication. Subsequent NIPs add features: NIP-04 enables encrypted direct messages, NIP-05 links Nostr keys to domain-based identifiers (like name@example.com), NIP-26 enables delegatable event signing, and NIP-57 implements Lightning zaps. Each NIP is a community proposal that goes through discussion, implementation, and adoption. This extensibility is what allows Nostr to evolve beyond simple social networking into identity, payments, marketplaces, and more. For platforms like BitTasker, NIPs provide the building blocks for decentralized identity, encrypted communication, and Lightning-integrated payments — all within a single protocol."
		},
		{
			heading: 'How does BitTasker use Nostr for identity?',
			body: "BitTasker uses Nostr as its identity layer, meaning your account IS your Nostr key pair — not an email address or username stored in a company database. When you sign up, you generate a key pair in your browser or wallet app. Your public key becomes your BitTasker identity, visible to clients and freelancers. Your private key signs transactions, work submissions, and reputation attestations. Because Nostr is a protocol (not a platform), your BitTasker identity can also be used on any other Nostr-compatible service — Damus, Primal, Amethyst, or custom applications. You don't need a separate account for each service. This portability means your reputation builds across the entire Nostr ecosystem, not just within one company's walled garden. If BitTasker went offline, your identity and reputation data would still exist on Nostr relays."
		},
		{
			heading: 'What are the benefits of Nostr identity for freelancers?',
			body: "Nostr's two greatest benefits for freelancers are censorship resistance and identity portability. Censorship resistance means no platform can ban you, delete your account, or deplatform you for political, commercial, or arbitrary reasons. Your identity exists on a protocol, not a company's server. Portability means you can use the same identity across multiple platforms simultaneously — your reputation on BitTasker, your social presence on Damus, your payments on any Lightning-enabled service, all under one key pair. This is fundamentally different from the web2 model where each platform owns your identity and data. For freelancers in regions with political instability, censorship, or unreliable financial infrastructure, Nostr identity provides a stable, portable digital presence that no government or corporation can take away."
		},
		{
			heading: 'What are the risks and considerations of Nostr identity?',
			body: "Nostr identity has real trade-offs. The most critical is key management: lose your private key and you lose your identity forever — there's no \"forgot password\" flow. This makes secure key storage essential, whether through hardware wallets, encrypted backups, or social recovery schemes. There's also the bootstrapping problem: since Nostr identity is new, most people don't yet have Nostr keys, so onboarding requires education. Relay reliability varies — some relays go offline, potentially losing messages. Multi-relay strategies mitigate this. Finally, the pseudonymous nature of Nostr keys means building trust requires additional mechanisms (web of trust, reputation systems, verified identifiers through NIP-05). BitTasker addresses many of these challenges through its integrated key management and reputation system, but users should understand the fundamental trade-off: maximum freedom comes with maximum personal responsibility."
		}
	],
	faq: [
		{
			question: 'Do I need an email to sign up for BitTasker?',
			answer:
				'No. BitTasker uses Nostr key pairs for identity — you generate a public/private key pair and that becomes your account. No email, no phone number, no personal information required. Your public key is your identity; your private key is your login.'
		},
		{
			question: 'What happens if I lose my private key?',
			answer:
				'Unfortunately, there is no recovery mechanism for lost Nostr private keys — this is by design for censorship resistance. If you lose your private key, you lose access to your identity permanently. This is why secure backup of your nsec is critical. BitTasker recommends encrypted digital backups plus a physical backup stored securely.'
		},
		{
			question: 'Is Nostr identity the same as a Bitcoin wallet?',
			answer:
				'Nostr identity and Bitcoin wallets are separate systems. Nostr uses its own key pair format (npub/nsec), while Bitcoin uses different key formats. However, many Nostr clients and services (including BitTasker) integrate Lightning payments, so your Nostr identity can be linked to Bitcoin payments.'
		},
		{
			question: 'Can anyone see what I do with my Nostr identity?',
			answer:
				'Your public key and the events you publish to relays are visible to relay operators and anyone monitoring those relays. However, your private key is never transmitted. Encrypted direct messages (NIP-04) are only readable by the intended recipient. The level of privacy depends on which relays you use and whether you employ additional privacy measures.'
		},
		{
			question: 'How does Nostr identity compare to logging in with Google or Apple?',
			answer:
				'Google/Apple sign-in relies on centralized providers who can revoke your access, track your activity, and require personal information. Nostr identity is decentralized — no provider can revoke it, no personal information is required, and your identity is portable across any Nostr-compatible service. The trade-off is that you bear full responsibility for key management.'
		},
		{
			question: 'Can I use the same Nostr identity on different platforms?',
			answer:
				"Yes. That's one of Nostr's core features. Your public key works across any Nostr-compatible service — BitTasker, Damus, Primal, Amethyst, and hundreds more. Your identity, reputation, and social connections travel with you without being owned by any single platform."
		}
	],
	bitTaskerCta: {
		heading: 'Own your identity with Nostr on BitTasker',
		body: 'BitTasker uses Nostr for identity, so you own your account — not a company. No email required, no central authority can ban you, and your identity is portable across the entire decentralized web.',
		buttonText: 'Create Your Nostr Identity',
		buttonHref: '/auth/signup'
	}
};
