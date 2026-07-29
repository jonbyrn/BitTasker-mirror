import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Nostr Marketplace: Decentralized Commerce for Freelancers',
		subtitle:
			'How the Nostr protocol enables censorship-resistant marketplaces with portable identity and reputation.'
	},
	answerBlock:
		"A Nostr marketplace is a freelance platform built on the Nostr protocol — a decentralized, open standard for identity and communication. Instead of registering accounts on a company's server, freelancers use cryptographic key pairs as identity. Listings, reviews, and reputation data are Nostr events signed by your private key and broadcast across distributed relays. No single company controls the marketplace, can ban your account, or erase your reputation. BitTasker uses Nostr as the identity layer, giving freelancers a portable, censorship-resistant professional presence that works across any compatible platform.",
	sections: [
		{
			heading: 'What is Nostr and how does it work?',
			body: 'Nostr (Notes and Other Stuff Transmitted by Relays) is a minimalist, open protocol for censorship-resistant communication. Every user has a public key (their identity) and a private key (their credential). Messages are signed events broadcast to multiple relays — independent servers that store and forward data. No relay is authoritative; if one goes down, others still have your data. There is no central server to hack, no company to enforce content policies, and no account to disable. This makes Nostr fundamentally different from Twitter, LinkedIn, or any centralized social or professional network.'
		},
		{
			heading: 'How does Nostr enable a freelance marketplace?',
			body: "Nostr enables marketplaces through specific event types (NIPs — Nostr Implementation Possibilities). A freelancer's profile is a signed Nostr event containing their skills, portfolio, and rates. Job listings are published as Nostr events that any relay can host. Proposals, contracts, and reviews are also signed events. Because every interaction is cryptographically signed, reputation cannot be faked or forged. The marketplace becomes a layer of interoperable events — anyone can build a client (app) that reads these events, meaning your freelancing profile works across multiple platforms simultaneously."
		},
		{
			heading: 'What is Nostr-based identity for freelancers?',
			body: "Your Nostr identity is a public-private key pair. Your public key is your universal username — across BitTasker, any Nostr social client, and any future Nostr-enabled marketplace. Your private key signs every action: job applications, delivery confirmations, reviews. This means your reputation is not stored in one company's database — it is distributed across relays and verifiable by anyone. If BitTasker shut down, your Nostr identity and all signed reputation data would survive and could be imported into any compatible platform. This is the core advantage over centralized freelancing profiles."
		},
		{
			heading: 'How do Nostr reviews and reputation work?',
			body: "Reviews on Nostr are signed events with a specific tag structure. After completing a job, the client publishes a review event signed with their private key. This review is tied to the freelancer's public key and the specific job event. Because it is cryptographically signed, the review cannot be altered or forged after publication. It is also permanent — no platform moderator can delete a legitimate review. Over time, a freelancer accumulates a verifiable trail of signed reviews that any platform can display. This creates a reputation system that is more trustworthy than centralized review platforms, where reviews can be selectively removed or manipulated."
		},
		{
			heading: 'How does BitTasker use Nostr?',
			body: 'BitTasker uses Nostr as the identity and reputation layer. When you create a BitTasker account, you generate a Nostr key pair (or import an existing one). Your profile, job history, reviews, and portfolio are all Nostr events. Payments run on Bitcoin Lightning (separate from Nostr, but complementary). Escrow uses Rootstock smart contracts. BitTasker provides the user experience — search, matching, delivery tracking, dispute resolution — while Nostr ensures your identity and reputation are portable and censorship-resistant. The platform handles the UX; Nostr handles the sovereignty.'
		},
		{
			heading: 'What is the future of Nostr commerce?',
			body: "Nostr commerce is expanding beyond social media into real economic activity. Marketplaces for freelance services (BitTasker), digital goods, peer-to-peer lending, and local commerce are all emerging on Nostr. The protocol's simplicity and open nature mean developers can build specialized clients without permission. As more users adopt Nostr identities for social interaction, the marginal cost of using the same identity for commerce drops to zero. The long-term vision is a unified professional identity — one Nostr key that works for social networking, freelancing, payments, and reputation — all without asking permission from any company."
		}
	],
	faq: [
		{
			question: 'Is Nostr the same as Bitcoin?',
			answer:
				'No. Nostr is an open communication protocol for identity and messaging; Bitcoin is a monetary network for payments. They complement each other: Nostr handles your identity and reputation, while Bitcoin (via Lightning) handles payments. BitTasker uses both — Nostr for identity, Bitcoin Lightning for payments.'
		},
		{
			question: 'Do I need to know how to code to use a Nostr marketplace?',
			answer:
				'No. Using a Nostr marketplace like BitTasker is similar to using any freelancing platform — you create a profile, browse jobs, submit proposals, and track deliverables. The Nostr infrastructure runs underneath. You only need to understand that your identity is a key pair and that you should back up your private key securely.'
		},
		{
			question: 'What happens if a Nostr relay goes offline?',
			answer:
				'Your data survives because it is distributed across multiple relays. No single relay is authoritative. If one relay goes down, your events are still stored on others. You can also publish to additional relays at any time for redundancy. This is fundamentally different from a centralized platform where a server outage can lock you out completely.'
		},
		{
			question: 'Can I use the same Nostr identity across different platforms?',
			answer:
				'Yes. Your Nostr public key is your identity everywhere. Any Nostr-compatible platform — social clients, marketplaces, forums — can read your signed events. This means your freelancing profile on BitTasker can be verified by any other Nostr app, creating a portable professional identity that no single company controls.'
		},
		{
			question: 'Are Nostr reviews more reliable than centralized platform reviews?',
			answer:
				'Yes, for two reasons. First, Nostr reviews are cryptographically signed by the reviewer, so they cannot be forged. Second, they cannot be selectively deleted by a platform moderator. This creates a more trustworthy and tamper-proof review system compared to centralized platforms where reviews can be manipulated or removed.'
		},
		{
			question: 'How do I get started with Nostr for freelancing?',
			answer:
				'Sign up for BitTasker, which will guide you through creating or importing a Nostr key pair. Your public key becomes your identity. From there, the experience is similar to any freelancing platform — browse jobs, apply, deliver work, and get paid in Bitcoin. The Nostr layer works behind the scenes to keep your identity portable and your reputation secure.'
		}
	],
	bitTaskerCta: {
		heading: 'Your identity. Your reputation. No permission needed.',
		body: 'BitTasker is built on Nostr — giving you a portable, censorship-resistant freelancing identity that no platform can revoke. Your reputation follows you everywhere.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
