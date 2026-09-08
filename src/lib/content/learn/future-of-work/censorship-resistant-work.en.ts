import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Censorship-Resistant Work: Freelancing Without Bans',
		subtitle:
			'Why account freezes, payment holds, and deplatforming make decentralized freelancing essential.'
	},
	answerBlock:
		'Censorship-resistant work means no central authority can freeze your earnings, ban your account, or erase your professional reputation. Freelancers on centralized platforms face real risks: Upwork has withheld payments during disputes, Fiverr has banned accounts without warning, and PayPal has frozen freelancer funds for months. Bitcoin and Nostr solve this at the infrastructure level. Bitcoin Lightning payments cannot be reversed or frozen by any third party. Nostr identity is cryptographically controlled by you — no company can disable your profile. BitTasker combines both to create a freelancing platform where your work and income are genuinely yours.',
	sections: [
		{
			heading: 'Why does censorship resistance matter for freelancers?',
			body: 'When a platform controls your account, it controls your livelihood. Upwork can suspend your account pending a dispute — locking you out of active contracts and withholding your earned balance. Fiverr can ban accounts based on algorithmic detection or client complaints, with a limited appeal process. PayPal has frozen freelancer accounts for months during "reviews." For freelancers who depend on a single platform for 50–100% of their income, a ban or freeze is not an inconvenience — it is a financial emergency. Censorship resistance means the platform is a service you use, not a landlord you depend on.'
		},
		{
			heading: 'What are real examples of freelancer deplatforming?',
			body: 'These are not hypothetical. Freelancers have been banned from Upwork for "suspicious activity" that turned out to be a false positive — losing years of reviews and pending payments. Fiverr has removed sellers for unclear reasons, with appeals taking weeks. PayPal has frozen accounts holding thousands of dollars for extended "security reviews." Even banks have closed accounts of freelancers who receive frequent international wire transfers, flagging legitimate income as suspicious. In every case, the freelancer had no effective recourse. The platform\'s decision was final.'
		},
		{
			heading: 'How does Bitcoin prevent payment censorship?',
			body: "Bitcoin transactions over the Lightning Network are peer-to-peer transfers between two wallets. No bank, payment processor, or platform can reverse, freeze, or seize a Lightning payment once it is confirmed. The freelancer receives satoshis directly in their wallet — no intermediary holds the funds. This is fundamentally different from Upwork's model where the platform holds your earnings in their internal system for 14+ days, or PayPal where funds can be frozen during an account review. With Bitcoin, if you have the private key to your wallet, you control your money — period."
		},
		{
			heading: 'How does Nostr prevent identity censorship?',
			body: 'Nostr gives you a cryptographic identity — a public-private key pair that no company issued and no company can revoke. Your public key is your professional identity. Every review, job completion, and portfolio piece is signed with your private key and broadcast to distributed relays. No single entity can delete your history, disable your profile, or prevent you from using your identity on other platforms. Even if BitTasker ceased to exist, your Nostr identity and all signed reputation data would persist on relays and could be imported into any compatible platform. Your career is not hostage to any company.'
		},
		{
			heading: 'What are the trade-offs of censorship-resistant work?',
			body: 'Censorship resistance is not free. You take on more personal responsibility: securing your private keys, managing your own Bitcoin wallet, and understanding that there is no "forgot password" recovery through a platform support team. If you lose your Nostr private key, you lose your identity. If you lose your Bitcoin wallet seed, you lose your funds. The regulatory landscape is also uncertain — some jurisdictions may impose reporting requirements on crypto payments. And the user experience is still less polished than mainstream platforms. These are real trade-offs, but for many freelancers, the risk of deplatforming outweighs the learning curve.'
		},
		{
			heading: 'How does BitTasker commit to censorship resistance?',
			body: "BitTasker is designed so that no single point of failure can shut down a freelancer's work. Identity is Nostr-based and portable. Payments are Bitcoin Lightning — peer-to-peer and irreversible. Escrow is RGB smart contracts — on-chain and auditable. BitTasker provides the marketplace UX but does not hold your funds, control your identity, or own your reputation. The platform is a tool you use, not a gatekeeper you depend on. This is not a marketing claim — it is an architectural commitment enforced by open protocols."
		}
	],
	faq: [
		{
			question: 'Can Upwork really freeze my earnings?',
			answer:
				'Yes. Upwork holds earnings in their internal system during disputes and can freeze funds while investigating account issues. Freelancers have reported waiting weeks or months to access their own money. With Bitcoin Lightning payments on BitTasker, funds arrive directly in your wallet — no platform holds your earnings.'
		},
		{
			question: 'What happens if I lose my Nostr private key?',
			answer:
				'If you lose your Nostr private key, you lose the ability to sign events with that identity. However, you can create a new key pair and start rebuilding your reputation. This is why secure key backup is critical — write it down, store it offline, and never share it. Unlike centralized accounts, there is no support team to recover your key, because no one else has it.'
		},
		{
			question: 'Is censorship resistance only for controversial content?',
			answer:
				'No. Censorship resistance protects any freelancer who depends on a platform for income. It is relevant whenever a platform has the power to freeze your earnings, ban your account, or erase your reputation — which applies to every freelancer on every centralized platform. You do not need to work in a controversial industry to benefit from not being deplatformed.'
		},
		{
			question: 'How do I know BitTasker will not just become another centralized platform?',
			answer:
				"BitTasker's architecture prevents centralization at the infrastructure level. Identity is Nostr (decentralized protocol). Payments are Bitcoin Lightning (peer-to-peer). Escrow is RGB smart contracts (on-chain). BitTasker controls the UX layer but not the underlying identity, payments, or escrow. Even if BitTasker's company disappeared, your Nostr identity and Bitcoin funds would remain accessible."
		},
		{
			question: 'Are there legal risks to using censorship-resistant platforms?',
			answer:
				'Receiving Bitcoin payments is legal in most jurisdictions. The legal risk is not in using the platform but in failing to report income for tax purposes. Always consult a tax professional in your country. Censorship resistance protects your ability to work — it does not exempt you from legal obligations.'
		},
		{
			question: 'What is the difference between censorship resistance and privacy?',
			answer:
				'Censorship resistance means no one can stop you from working or receiving payment. Privacy means no one can see your activity. BitTasker focuses on censorship resistance — your identity is verifiable (so clients can trust your reputation) and your payments are transparent on the blockchain. It is not an anonymous platform; it is a platform where no authority can shut you down.'
		}
	],
	bitTaskerCta: {
		heading: 'Work without fear of being shut out.',
		body: "BitTasker's decentralized architecture means no platform can freeze your funds, ban your account, or erase your reputation. Your work is protected by Bitcoin and Nostr — open protocols that no company controls.",
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
