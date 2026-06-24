import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Bitcoin Escrow: How Smart Contracts Protect Freelancers',
		subtitle:
			'Rootstock smart contracts replace corporate trust with code. Learn how Bitcoin escrow secures every freelance project.'
	},
	answerBlock:
		'Bitcoin escrow uses smart contracts on Rootstock (a Bitcoin sidechain) to lock project funds in auditable code until both freelancer and client confirm completion. Unlike traditional escrow managed by platform companies, Bitcoin escrow is trustless — no single entity can freeze, redirect, or manipulate the funds. On BitTasker, escrow contracts automatically release payment when milestones are approved, and disputes follow transparent on-chain resolution rules. This eliminates the risk of clients not paying after work is delivered, or platforms withholding freelancer earnings.',
	sections: [
		{
			heading: 'How does Bitcoin escrow work?',
			body: "Bitcoin escrow operates through smart contracts — self-executing programs deployed on a blockchain that enforce predefined rules. When a client hires a freelancer on BitTasker, the project funds are deposited into a Rootstock smart contract. The contract locks these funds and specifies the conditions for release: typically, delivery confirmation from both parties or resolution of a dispute. Once the conditions are met, the contract automatically sends Bitcoin to the freelancer. No human intermediary touches the funds during this process. The code is auditable on the blockchain, so both parties can verify the contract's logic before committing."
		},
		{
			heading: 'How does traditional escrow compare to Bitcoin escrow?',
			body: 'Traditional platform escrow relies on a company holding your funds in their bank accounts. Upwork, Fiverr, and Freelancer.com all operate internal escrow systems where the platform acts as both custodian and judge. If the platform goes down, freezes your account, or changes its terms, your funds are at risk. Bitcoin escrow removes the company from the equation. Funds are locked in a public smart contract that no single entity controls. The rules are transparent, auditable, and enforced by code. If BitTasker disappeared tomorrow, escrow funds on Rootstock would remain accessible through the blockchain.'
		},
		{
			heading: 'What is Rootstock and why is it used for escrow?',
			body: "Rootstock (RSK) is a Bitcoin sidechain — a Layer 2 network that brings smart contract capabilities to Bitcoin while inheriting Bitcoin's security model. Unlike Ethereum smart contracts, Rootstock contracts are backed by Bitcoin's hash rate through merged mining, making them among the most secure smart contracts in the industry. For escrow, Rootstock offers several advantages: lower transaction fees than Ethereum, Bitcoin-level security, and the ability to use BTC directly in contracts without wrapping or converting. BitTasker chose Rootstock specifically because it combines Bitcoin's security with the programmability needed for complex escrow and dispute resolution."
		},
		{
			heading: 'How does dispute resolution work in Bitcoin escrow?',
			body: "When both parties agree on project completion, resolution is simple — the smart contract releases payment. Disputes arise when a freelancer delivers work the client claims is incomplete, or when a client requests scope changes the freelancer considers out of agreement. On BitTasker, dispute resolution follows a structured process: both parties submit evidence through the platform, and the smart contract executes the resolution based on predefined rules. This is slower than a human support agent when both parties cooperate, but it's transparent, auditable, and free from the bias that can affect human mediators. Neither party can manipulate the outcome once the contract rules are set."
		},
		{
			heading: 'Why does escrow matter for freelancers?',
			body: 'Escrow protects freelancers from the most common risk in remote work: completing a project and not getting paid. Without escrow, a client could receive deliverables and simply refuse payment — leaving the freelancer with no recourse. Bitcoin escrow solves this by holding funds in a smart contract before work begins. The freelancer sees confirmation that funds are locked, and knows payment will arrive when they deliver. This eliminates the payment anxiety that plagues freelance relationships and creates a more professional, trustworthy working environment.'
		},
		{
			heading: 'Why does escrow matter for clients?',
			body: 'Escrow also protects clients by ensuring they only pay for work that meets the agreed specifications. Without escrow, clients risk paying upfront and receiving substandard work — or no work at all. Bitcoin escrow holds funds until the client approves delivery, giving them time to review deliverables before payment is released. The smart contract ensures that funds can only be released according to the agreed terms, preventing freelancers from claiming payment without completing the work.'
		},
		{
			heading: "How does BitTasker's escrow compare to other platforms?",
			body: "BitTasker's Rootstock-based escrow differs from traditional platform escrow in three key ways. First, it's trustless — no company holds the funds, code does. Second, it's auditable — both parties can verify the contract on the blockchain before agreeing. Third, it's portable — escrow funds exist on the Rootstock blockchain, not in a platform's bank account, making them accessible even if the platform goes offline. Traditional platforms like Upwork and Fiverr keep escrow internal, giving you no visibility into where your funds actually are or how they're protected."
		}
	],
	faq: [
		{
			question: 'Is Bitcoin escrow safe?',
			answer:
				"Yes. Bitcoin escrow on Rootstock is backed by Bitcoin's security model through merged mining. Smart contracts are auditable on the blockchain, meaning both parties can verify the code before committing funds. The risk of manipulation is extremely low compared to centralized escrow held by platform companies."
		},
		{
			question: 'What happens if a dispute cannot be resolved?',
			answer:
				"If both parties cannot agree, BitTasker's dispute resolution follows the smart contract's predefined rules. In extreme cases, funds may be held until a resolution is reached through the platform's structured evidence submission process. The process is designed to be fair and transparent, with outcomes determined by the contract code rather than human judgment."
		},
		{
			question: 'Does Bitcoin escrow cost extra fees?',
			answer:
				"BitTasker's service fee (5–10%) covers escrow management, platform use, and dispute resolution. There are no separate escrow fees on top of the service fee. Rootstock network fees for smart contract interactions are minimal (typically under $0.01)."
		},
		{
			question: 'Can I use Bitcoin escrow for any type of freelance project?',
			answer:
				"Yes. Bitcoin escrow works for any project type — fixed-price, hourly, or milestone-based. The smart contract is configured to match the project's payment structure. From software development to design to consulting, any freelance engagement can use Bitcoin escrow for secure fund management."
		},
		{
			question: 'How is Rootstock escrow different from Ethereum escrow?',
			answer:
				"Rootstock escrow is backed by Bitcoin's hash rate through merged mining, making it more secure than Ethereum-based alternatives. It uses BTC directly without wrapping, has lower transaction fees, and benefits from Bitcoin's proven security model rather than Ethereum's separate consensus mechanism."
		},
		{
			question: 'What if BitTasker goes offline — are my escrow funds safe?',
			answer:
				"Yes. Escrow funds exist on the Rootstock blockchain, not on BitTasker's servers. Even if BitTasker goes offline, you can interact with the smart contract directly through the Rootstock blockchain to access or manage your funds. This is the fundamental advantage of on-chain escrow over platform-held escrow."
		}
	],
	bitTaskerCta: {
		heading: 'Secure your next project with Bitcoin escrow',
		body: "BitTasker's Rootstock smart contracts protect both freelancers and clients with auditable, trustless escrow. No company holds your funds — code does.",
		buttonText: 'Start a Secure Project',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How Bitcoin Escrow Works on BitTasker',
		description:
			'Step-by-step walkthrough of how Rootstock smart contracts protect freelance payments through trustless escrow.',
		totalTime: 'PT10M',
		steps: [
			{
				name: 'Client creates task and deposits BTC',
				text: 'The client creates a project on BitTasker, defines the scope and milestones, and deposits RBTC (Bitcoin on Rootstock) into the escrow smart contract.'
			},
			{
				name: 'Funds locked in Rootstock smart contract',
				text: 'The deposited RBTC is locked in a transparent smart contract on Rootstock. Both parties can verify the contract terms and confirm funds are secured on-chain.'
			},
			{
				name: 'Freelancer completes work',
				text: 'The freelancer delivers the project according to the agreed milestones. Work progress and deliverables are tracked through the platform.'
			},
			{
				name: 'Client reviews and approves',
				text: 'The client reviews the delivered work and approves the milestone or raises a dispute. Approval triggers the smart contract release conditions.'
			},
			{
				name: 'Funds released to freelancer',
				text: "Upon approval, the smart contract automatically releases the RBTC to the freelancer's wallet. The payment arrives instantly via Rootstock with minimal gas fees."
			}
		]
	}
};
