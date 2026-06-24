import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'BitTasker Multi-Chain: Using Multiple Bitcoin Layer 2s',
		subtitle:
			'Lightning for payments, Rootstock for escrow, Liquid for stablecoins. See how BitTasker combines Layer 2s for the best freelance experience.'
	},
	answerBlock:
		"BitTasker is a multi-chain freelance platform that uses multiple Bitcoin Layer 2s simultaneously — not because blockchain maximalism demands it, but because each Layer 2 excels at a different job. Lightning Network handles instant, low-fee payments. Rootstock powers smart contract escrow backed by Bitcoin's security. Liquid Network enables confidential stablecoin transactions through Aqua Wallet integration. By combining these networks, BitTasker gives freelancers and clients the fastest payments, the most secure escrow, and flexible stablecoin support without compromising on any single dimension.",
	sections: [
		{
			heading: 'Why does BitTasker use multiple Bitcoin Layer 2s?',
			body: "No single Bitcoin Layer 2 does everything well. Lightning is unmatched for instant payments but doesn't support smart contracts. Rootstock excels at DeFi and escrow but isn't designed for micropayments. Liquid offers privacy and stablecoins but uses a federation model. Instead of forcing users onto one network, BitTasker routes each feature to the Layer 2 that handles it best. This multi-chain approach means freelancers get instant payment confirmations, clients get Bitcoin-secured escrow, and both parties can use stablecoins for predictable invoicing — all from a single platform interface."
		},
		{
			heading: 'How does BitTasker use Lightning for instant payments?',
			body: "BitTasker uses Lightning Network as the primary payment rail for freelancer compensation. When a milestone is completed and approved, payment is sent via Lightning — arriving in seconds with fees under $0.01. Lightning's payment channel architecture enables instant settlement without waiting for Bitcoin block confirmations. For freelancers in emerging markets, this means getting paid immediately rather than waiting hours or days for on-chain Bitcoin transactions. BitTasker's Lightning integration also supports streaming payments for hourly work, where freelancers receive real-time compensation as they work."
		},
		{
			heading: 'How does BitTasker use Rootstock for smart contract escrow?',
			body: "Project funds are locked in Rootstock smart contracts before work begins. These EVM-compatible contracts enforce payment terms, milestone schedules, and dispute resolution rules in auditable code. Rootstock's merge-mined security with Bitcoin means escrow contracts inherit Bitcoin's hash rate protection. The contract releases funds automatically when milestones are approved by both parties. If disputes arise, the smart contract follows predefined resolution logic — no company holds the funds or acts as judge. BitTasker chose Rootstock for escrow because it combines Bitcoin security with the programmability needed for complex freelance agreements."
		},
		{
			heading: 'How does BitTasker use Liquid for stablecoin support?',
			body: "Through Aqua Wallet integration, BitTasker supports Tether USDt on Liquid Network for freelancers and clients who need dollar-denominated stability. Liquid's confidential transactions hide payment amounts from public view, providing privacy for business invoicing. Stablecoin support matters for freelancers in high-inflation economies where BTC price volatility creates budgeting uncertainty. By receiving a portion of payments in USDt on Liquid, freelancers can lock in dollar values while still operating within the Bitcoin ecosystem. Liquid's fast confirmations (~2 minutes) and minimal fees make it practical for regular stablecoin transactions."
		},
		{
			heading: 'How does multi-chain work in practice for BitTasker?',
			body: "A typical BitTasker project might flow like this: A client deposits funds into a Rootstock escrow contract denominated in BTC. The freelancer begins work and submits milestones. When a milestone is approved, the Rootstock contract releases BTC, which BitTasker routes via Lightning to the freelancer's wallet — arriving in seconds. If the freelancer prefers stablecoins, BitTasker can convert the BTC to USDt on Liquid and send it through Aqua Wallet. All of this happens behind a single interface — the user doesn't need to understand which Layer 2 is handling each transaction."
		},
		{
			heading: 'Why does multi-chain matter for freelancers?',
			body: "Freelancers need reliability, speed, and flexibility — not blockchain ideology. A developer in Argentina needs instant payment in a stable currency. A designer in Nigeria needs escrow protection without bank intermediaries. A consultant in the US needs tax-friendly invoicing in BTC. Multi-chain support means each freelancer can choose the payment method that fits their situation: Lightning for speed, Liquid for stablecoins and privacy, Rootstock for escrow security. The platform handles the complexity so users don't have to."
		},
		{
			heading: 'What other Layer 2s might BitTasker support?',
			body: "BitTasker evaluates new Bitcoin Layer 2s as they mature. Stacks is a strong candidate for future integration — its sBTC token could enable programmable Bitcoin escrow with Clarity's safety guarantees. Merlin Chain's ZK-rollup technology offers potential for lower-cost smart contract interactions. BOB's multi-VM approach could bridge Bitcoin ordinals with DeFi capabilities. The criteria for adding new Layer 2s include: security model maturity, ecosystem adoption, fee structure, and how well the network complements BitTasker's existing Layer 2 stack."
		}
	],
	faq: [
		{
			question: 'Do I need to manage multiple wallets for BitTasker?',
			answer:
				"No. BitTasker's interface handles multi-chain complexity behind the scenes. You connect a single wallet — like Aqua, which supports Lightning, Liquid, and Rootstock natively — and the platform routes transactions to the appropriate Layer 2 automatically."
		},
		{
			question: 'Which Layer 2 does BitTasker use for escrow?',
			answer:
				'BitTasker uses Rootstock smart contracts for escrow. Rootstock is EVM-compatible and merged-mined with Bitcoin, providing Bitcoin-secured smart contracts with low fees. Escrow funds are locked in auditable Solidity contracts on the Rootstock sidechain.'
		},
		{
			question: 'Can I receive payments in stablecoins on BitTasker?',
			answer:
				'Yes. BitTasker supports Tether USDt on Liquid Network through Aqua Wallet integration. Freelancers can choose to receive a portion of their payments in USDt for dollar stability, with confidential transactions that hide payment amounts.'
		},
		{
			question: 'How fast are BitTasker payments?',
			answer:
				'Lightning payments arrive in seconds with minimal fees. Rootstock escrow releases are confirmed in ~30 seconds. Liquid stablecoin transfers settle in ~2 minutes. The fastest experience is Lightning for direct payments.'
		},
		{
			question: 'Is my escrow fund safe if BitTasker goes offline?',
			answer:
				"Yes. Escrow funds exist on the Rootstock blockchain in smart contracts — not on BitTasker's servers. Even if the platform goes offline, you can interact with the escrow contract directly through the Rootstock network to access your funds."
		},
		{
			question: 'Why not just use one Layer 2?',
			answer:
				"Each Layer 2 has strengths and tradeoffs. Lightning excels at payments but can't do smart contracts. Rootstock excels at escrow but isn't optimized for micropayments. Liquid excels at privacy and stablecoins but uses a federation model. Multi-chain lets BitTasker use each network for what it does best."
		},
		{
			question: 'Will BitTasker add Stacks support?',
			answer:
				'BitTasker evaluates Layer 2 integrations based on maturity, security, and user demand. Stacks with sBTC is a strong candidate for future support, particularly for programmable Bitcoin features. Integration decisions depend on ecosystem adoption and technical readiness.'
		}
	],
	bitTaskerCta: {
		heading: 'The multi-chain freelance platform built on Bitcoin',
		body: 'BitTasker combines Lightning, Rootstock, and Liquid to deliver instant payments, Bitcoin-secured escrow, and stablecoin support — all from one platform.',
		buttonText: 'Join BitTasker',
		buttonHref: '/auth/signup'
	}
};
