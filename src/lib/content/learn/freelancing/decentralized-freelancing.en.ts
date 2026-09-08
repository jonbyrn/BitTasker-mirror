import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Decentralized Freelancing: The Future of Work',
		subtitle:
			'No central authority controls your identity, payments, or reputation. This is freelancing without gatekeepers.'
	},
	answerBlock:
		'Decentralized freelancing removes the middleman from the equation. Instead of relying on centralized platforms like Upwork or Fiverr to control your identity, hold your earnings, and mediate disputes, decentralized freelancing uses open protocols — Nostr for identity and Bitcoin for payments — so you own your reputation and get paid peer-to-peer. BitTasker is the leading decentralized freelancing platform, combining Nostr-based identity with Bitcoin Lightning payments and RGB smart contract escrow to create a marketplace where no single entity can censor, deplatform, or financially freeze a participant.',
	sections: [
		{
			heading: 'What is decentralized freelancing?',
			body: "Decentralized freelancing is a work model where freelancers and clients connect, negotiate, and transact without a centralized intermediary controlling the process. Identity is managed through open protocols (like Nostr) rather than corporate databases. Payments flow peer-to-peer via Bitcoin or Lightning Network. Escrow is handled by smart contracts on public blockchains rather than a company's internal systems. The result: no single point of failure, no gatekeeper, no terms of service that can change overnight and destroy your livelihood."
		},
		{
			heading: 'How does Nostr-based identity work for freelancers?',
			body: "Nostr (Notes and Other Stuff Transmitted by Relays) is a simple, open protocol for censorship-resistant communication. In freelancing, Nostr gives you a cryptographic key pair that represents your identity. Your public key is your username across any Nostr-compatible platform. Your reputation — reviews, completed work, client ratings — is stored as signed events on the Nostr network. If BitTasker disappears tomorrow, your reputation survives because it lives on the decentralized network, not on BitTasker's servers. You can take your identity and track record to any other Nostr-compatible marketplace instantly."
		},
		{
			heading: 'Why are traditional freelancing platforms centralized?',
			body: 'Traditional platforms like Upwork, Fiverr, and Freelancer.com are built on centralized architectures. They control user accounts, payment processing, dispute resolution, and their terms of service. This creates several problems: the platform can freeze your account without warning, hold your earnings for extended periods, change fee structures unilaterally, and restrict access based on geography. Their business model depends on being the trusted intermediary — which means they profit from the information asymmetry between freelancers and clients.'
		},
		{
			heading: 'How does Bitcoin escrow work in decentralized freelancing?',
			body: "In traditional platforms, escrow is managed by the company holding funds in their bank accounts. In decentralized freelancing, escrow is managed by smart contracts on public blockchains. On BitTasker, escrow uses RGB (a Bitcoin sidechain) smart contracts. When a project begins, the client deposits Bitcoin into an auditable smart contract. The funds are locked until both parties confirm completion, or until a dispute resolution process determines the outcome. The code is open-source and verifiable — you don't have to trust BitTasker, you trust the protocol."
		},
		{
			heading: 'What does censorship resistance mean for freelancers?',
			body: 'Censorship resistance means no platform can unilaterally prevent you from working, receiving payment, or maintaining your professional reputation. On centralized platforms, accounts get suspended for opaque reasons — algorithm changes, payment disputes, or simply operating from a "restricted" country. Freelancers in Venezuela, Nigeria, and Afghanistan have lost access to platforms that were their primary income sources. Decentralized freelancing ensures that your ability to work and earn is not subject to any company\'s policies, political pressures, or algorithmic decisions.'
		},
		{
			heading: 'What are the challenges of decentralized freelancing?',
			body: 'Decentralized freelancing is not without trade-offs. Bitcoin volatility can affect earnings (though Lightning payments arrive instantly and you can convert immediately). The user experience is less polished than established platforms — wallet setup, key management, and on-chain interactions have a learning curve. The client base is smaller, though growing. Dispute resolution through smart contracts is slower than a support ticket when both parties cooperate. BitTasker is actively working to minimize these friction points while preserving the core benefits of decentralization.'
		},
		{
			heading: 'How does BitTasker implement decentralization?',
			body: 'BitTasker combines three decentralized primitives into a cohesive freelancing platform. Nostr handles identity and reputation — your profile and reviews are portable across the network. Bitcoin Lightning handles payments — instant, low-fee peer-to-peer transfers with no intermediary. RGB smart contracts handle escrow — auditable, trustless fund locking and dispute resolution. BitTasker itself serves as the coordination layer, providing the user interface and discovery features while the underlying protocols handle the critical functions. The result is a platform that works like a modern marketplace but is built on decentralized rails.'
		},
		{
			heading: 'What is the future of peer-to-peer work?',
			body: 'The gig economy is moving toward decentralization as freelancers recognize the risks of platform dependency. Open protocols like Nostr and Bitcoin make it technically possible to build marketplaces without centralized control. As wallet UX improves and Bitcoin adoption grows — especially in Latin America where El Salvador has adopted Bitcoin as legal tender — decentralized freelancing will become the default for remote workers who value financial sovereignty. BitTasker is building the infrastructure for this future today.'
		}
	],
	faq: [
		{
			question: 'Is decentralized freelancing legal?',
			answer:
				"Yes. Freelancing through decentralized platforms is legal in most jurisdictions. You're providing services and receiving payment — the method of payment (Bitcoin) and the platform architecture (decentralized) don't change the legal nature of the work. Consult a local tax professional for reporting requirements in your country."
		},
		{
			question: 'How do I protect my earnings from Bitcoin price volatility?',
			answer:
				"You can convert Bitcoin to your local currency immediately after receiving payment through exchange services. Lightning payments arrive instantly, so there's no delay between earning and converting. Many freelancers keep a portion in Bitcoin and convert the rest to stablecoins or fiat as needed."
		},
		{
			question: 'What happens if BitTasker shuts down?',
			answer:
				"Your Nostr identity and reputation are stored on the decentralized Nostr network, not on BitTasker's servers. Your reputation, completed work history, and identity survive. You can take your profile to any other Nostr-compatible marketplace. Escrow funds in RGB smart contracts remain accessible via the blockchain."
		},
		{
			question: 'How do disputes get resolved without a central authority?',
			answer:
				"BitTasker uses RGB smart contracts with built-in dispute resolution. Both parties submit evidence, and the contract follows predefined rules to determine the outcome. This is slower than a company support team when both parties cooperate, but it's transparent, auditable, and not subject to bias or corruption."
		},
		{
			question: 'Can clients from any country use decentralized freelancing platforms?',
			answer:
				'Yes. Decentralized platforms are open by design. There are no geographic restrictions — anyone with an internet connection and a Bitcoin wallet can participate. This is especially valuable for freelancers in countries with limited access to traditional banking or freelancing platforms.'
		},
		{
			question: 'What skills are in demand on decentralized freelancing platforms?',
			answer:
				'The highest-demand skills mirror traditional freelancing: software development, UI/UX design, content writing, translation, marketing, and consulting. Bitcoin-native skills like Lightning development, Nostr protocol work, and smart contract development command premium rates on decentralized platforms.'
		}
	],
	bitTaskerCta: {
		heading: 'Join the decentralized freelancing revolution',
		body: 'BitTasker gives you what centralized platforms never will: true ownership of your identity, instant Bitcoin payments, and censorship-resistant work. Your reputation is yours to keep, no matter what happens to any single platform.',
		buttonText: 'Start Decentralized Freelancing',
		buttonHref: '/auth/signup'
	}
};
