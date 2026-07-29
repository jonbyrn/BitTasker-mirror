import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Rootstock vs Ethereum: Which Smart Contract Platform?',
		subtitle:
			'Rootstock and Ethereum both run smart contracts. Compare security, fees, ecosystem, and use cases to choose the right chain.'
	},
	answerBlock:
		"Rootstock and Ethereum are both EVM-compatible smart contract platforms, but they serve different purposes. Rootstock is a Bitcoin sidechain secured by Bitcoin's hash rate through merged mining, offering lower fees and direct BTC usage. Ethereum is the original smart contract platform with the largest developer ecosystem, most deployed contracts, and highest total value locked. Choose Rootstock when you want Bitcoin-level security with EVM compatibility and lower costs. Choose Ethereum when you need access to the largest DeFi ecosystem and deepest liquidity. For BitTasker, Rootstock was the clear choice — its Bitcoin security model makes it ideal for escrow contracts that hold real money.",
	sections: [
		{
			heading: 'What is the main difference between Rootstock and Ethereum?',
			body: "The main difference is security model and asset. Rootstock is a Bitcoin sidechain — it runs parallel to Bitcoin and is secured by Bitcoin miners through merged mining. Its native asset is RBTC (pegged 1:1 to BTC). Ethereum is an independent blockchain with its own Proof of Stake consensus and ETH as its native asset. Rootstock inherits Bitcoin's security and uses BTC in contracts; Ethereum has its own security layer and uses ETH. Both use Solidity and the EVM, so developer experience is nearly identical."
		},
		{
			heading: 'How do fees compare between Rootstock and Ethereum?',
			body: "Rootstock gas fees are dramatically lower than Ethereum. Typical Rootstock transactions cost under $0.01, while Ethereum transactions regularly cost $1-50+ depending on network congestion. During high-demand periods, Ethereum gas can spike to $100+ for complex contract interactions. Rootstock's low fees make it viable for microtransactions, small escrow payments, and high-frequency interactions that would be cost-prohibitive on Ethereum. This fee advantage is significant for freelancing platforms where project payments can range from $50 to $5,000."
		},
		{
			heading: 'Which has a larger ecosystem — Rootstock or Ethereum?',
			body: "Ethereum has the largest smart contract ecosystem in crypto with hundreds of billions in TVL, thousands of deployed protocols, and the most developers. Rootstock's ecosystem is smaller but growing, with established DeFi protocols (Sovryn, MoneyOnChain) and increasing institutional adoption. Rootstock benefits from EVM compatibility — Ethereum tools, libraries, and even some contracts can be ported directly. Ethereum is the clear leader in ecosystem size, but Rootstock's Bitcoin security model makes it attractive for applications that prioritize security over ecosystem breadth."
		},
		{
			heading: 'When should you choose Rootstock over Ethereum?',
			body: "Choose Rootstock when your application holds significant value and benefits from Bitcoin-level security — like escrow, custody, and DeFi protocols that manage user funds. Choose Rootstock when you need lower transaction fees for frequent interactions. Choose Rootstock when your users are Bitcoin holders who want to interact with smart contracts without converting to ETH. Choose Rootstock when regulatory considerations favor Bitcoin's more established legal status. BitTasker chose Rootstock because escrow contracts must be maximally secure — Bitcoin's hash rate provides stronger security guarantees than any alternative."
		},
		{
			heading: 'When should you choose Ethereum over Rootstock?',
			body: "Choose Ethereum when you need access to the deepest liquidity pools and the widest range of DeFi protocols. Choose Ethereum when your application requires specific Ethereum-native features or integrations. Choose Ethereum when you need the largest selection of developer tools and third-party services. Choose Ethereum when your target audience is already embedded in the Ethereum ecosystem. Ethereum's advantage is ecosystem maturity — more auditors, more tooling, more integrations, and more users. For applications where ecosystem size matters more than Bitcoin security, Ethereum is the stronger choice."
		},
		{
			heading: 'Can I move assets between Rootstock and Ethereum?',
			body: 'Yes, though it requires bridging. Assets can be moved between Rootstock and Ethereum through cross-chain bridges. However, this introduces bridge risk and additional complexity. In practice, most users choose one chain and stay on it. If you need BTC in smart contracts, Rootstock is native. If you need ETH in smart contracts, Ethereum is native. Bridging should be done only when necessary, with awareness of the associated risks.'
		}
	],
	faq: [
		{
			question: 'Is Rootstock faster than Ethereum?',
			answer:
				"Rootstock has faster block times and lower fees than Ethereum, but both are relatively slow compared to high-throughput chains. Rootstock's advantage is cost and Bitcoin security, not raw speed. For most applications, Rootstock and Ethereum have comparable performance."
		},
		{
			question: 'Can I use MetaMask with Rootstock?',
			answer:
				'Yes. Rootstock is EVM-compatible and works with MetaMask. You just need to add the Rootstock network configuration to MetaMask. The same wallets, tools, and interfaces that work on Ethereum work on Rootstock.'
		},
		{
			question: 'Which is more decentralized — Rootstock or Ethereum?',
			answer:
				'Ethereum has more validators and a more distributed consensus network. Rootstock relies on merged mining with Bitcoin miners, which provides strong security but fewer direct participants. Both are considered sufficiently decentralized for most applications.'
		},
		{
			question: 'Is Rootstock an Ethereum clone?',
			answer:
				"Rootstock is not a clone — it's a separate blockchain that uses the EVM for smart contract execution. It has its own consensus mechanism (merged mining with Bitcoin), its own token (RBTC), and its own network. The EVM compatibility is a design choice that enables developer tool reuse."
		},
		{
			question: 'Can I deploy the same contract on both chains?',
			answer:
				'Yes, since both use Solidity and the EVM, the same contract code can typically be deployed on both Rootstock and Ethereum with minimal or no modifications. The main difference is the underlying security and gas costs.'
		},
		{
			question: 'Why does BitTasker use Rootstock instead of Ethereum?',
			answer:
				"BitTasker uses Rootstock because escrow contracts need maximum security. Rootstock is backed by Bitcoin's hash rate — the largest security layer in crypto. Additionally, Rootstock's lower fees make microtransactions viable, and BTC-native users don't need to convert to ETH."
		}
	],
	bitTaskerCta: {
		heading: 'Secure escrow powered by Bitcoin',
		body: "BitTasker chose Rootstock over Ethereum for one reason: Bitcoin-level security for your money. Smart contracts backed by the world's most powerful hash rate.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	}
};
