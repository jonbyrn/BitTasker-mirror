import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'RBTC Guide: How to Use Rootstock Bitcoin',
		subtitle:
			"RBTC is Bitcoin on Rootstock. Learn how to get it, use it for gas fees, and leverage it in BitTasker's escrow system."
	},
	answerBlock:
		'RBTC (Rootstock Bitcoin) is the native token of the Rootstock network, pegged 1:1 to Bitcoin. You use RBTC to pay for gas fees when executing smart contracts on Rootstock — similar to how ETH works on Ethereum. RBTC is obtained by bridging BTC from the Bitcoin mainchain to Rootstock through a federated bridge. Every RBTC is backed by exactly one BTC locked in the bridge, maintaining a stable 1:1 peg. On BitTasker, RBTC powers the escrow system — clients fund projects with RBTC, freelancers receive RBTC, and all smart contract interactions are paid for with minimal RBTC gas fees (typically under $0.01).',
	sections: [
		{
			heading: 'What is RBTC?',
			body: "RBTC is a token on the Rootstock sidechain that represents Bitcoin. It is pegged 1:1 to BTC, meaning one RBTC always equals one Bitcoin. RBTC exists because Rootstock is a separate network from Bitcoin — it needs its own native token to pay for transaction fees and smart contract execution. When you bridge BTC to Rootstock, you receive an equivalent amount of RBTC. When you bridge back to Bitcoin, RBTC is burned and BTC is unlocked. RBTC is not a separate cryptocurrency — it's Bitcoin operating on the Rootstock sidechain."
		},
		{
			heading: 'How do I get RBTC?',
			body: 'You get RBTC by bridging BTC from the Bitcoin mainchain to Rootstock. The most common method is using the Rootstock Bridge — a web interface where you send BTC to a specified address and receive RBTC on Rootstock. The bridge is federated, meaning a network of independent functionaries validates and processes cross-chain transfers. Third-party services like Li.Fi and FastBTC also offer bridging with different UX options. Once you have RBTC in a Rootstock-compatible wallet (like MetaMask configured for Rootstock), you can use it for gas fees, DeFi, escrow, or any Rootstock application.'
		},
		{
			heading: 'How do I use RBTC for gas fees?',
			body: 'RBTC is used to pay for every transaction on Rootstock, just like ETH on Ethereum. When you send tokens, interact with a smart contract, or perform any on-chain action on Rootstock, you need RBTC in your wallet to cover the gas fee. The good news is Rootstock gas fees are extremely low — typically under $0.01 per transaction. Even complex smart contract interactions rarely cost more than a few cents. You need a small amount of RBTC in your wallet to operate on Rootstock, but the cost is negligible compared to Ethereum gas fees.'
		},
		{
			heading: 'How does RBTC work in BitTasker?',
			body: "In BitTasker, RBTC is the currency for escrow and payments. When a client funds a project, they deposit RBTC into the escrow smart contract on Rootstock. When the project is completed and approved, RBTC is released to the freelancer. All smart contract interactions — funding, delivery, approval, dispute resolution — are paid for with RBTC gas fees. The freelancer receives RBTC which they can hold, use for other Rootstock applications, or bridge back to BTC on the Bitcoin mainchain. This creates a seamless Bitcoin-native payment flow secured by Rootstock's smart contracts."
		},
		{
			heading: 'What is the RBTC peg and how is it maintained?',
			body: "The RBTC peg is maintained by the Rootstock federated bridge. When BTC is sent to the bridge, it is locked in a multi-signature address, and an equivalent amount of RBTC is minted on Rootstock. When RBTC is sent back to the bridge, it is burned, and the corresponding BTC is released. This lock-and-mint / burn-and-release mechanism keeps RBTC pegged 1:1 to BTC. The federation consists of independent functionaries who collectively control the bridge, requiring multiple signatures to process transfers. This federated model has been operational since Rootstock's launch in 2018 with a strong security track record."
		},
		{
			heading: 'Can I convert RBTC back to BTC?',
			body: 'Yes. You can bridge RBTC back to BTC at any time through the Rootstock Bridge or third-party services. The process burns your RBTC on Rootstock and releases the equivalent BTC on the Bitcoin mainchain. Bridging back to Bitcoin typically takes 20-30 minutes depending on Bitcoin confirmation times. There is a small bridge fee for the conversion, and you should ensure you have enough RBTC to cover both the bridge transaction and any remaining gas fees.'
		}
	],
	faq: [
		{
			question: 'Is RBTC the same as BTC?',
			answer:
				"RBTC is pegged 1:1 to BTC and backed by locked Bitcoin, but it operates on the Rootstock sidechain, not on Bitcoin's mainchain. RBTC is used for smart contract interactions on Rootstock, while BTC operates on Bitcoin's base layer. You can convert between them through the Rootstock Bridge."
		},
		{
			question: 'How much RBTC do I need to use Rootstock?',
			answer:
				'You need a small amount of RBTC for gas fees — typically $1-5 worth is sufficient for dozens of transactions. For escrow or DeFi use, you need RBTC equivalent to the amount you want to transact. Gas fees are minimal (under $0.01 per transaction).'
		},
		{
			question: 'Is bridging BTC to RBTC safe?',
			answer:
				"The Rootstock federated bridge has been operational since 2018 with billions in processed transfers and no security incidents. The bridge uses multi-signature security with independent functionaries. While no bridge is risk-free, Rootstock's bridge has one of the strongest track records in the industry."
		},
		{
			question: 'How long does bridging take?',
			answer:
				'Bridging from BTC to RBTC typically takes 10-30 minutes, depending on Bitcoin confirmation requirements. Bridging back from RBTC to BTC takes similar time. Third-party bridging services may offer faster options.'
		},
		{
			question: 'What wallets support RBTC?',
			answer:
				'Any Ethereum-compatible wallet configured for the Rootstock network supports RBTC. MetaMask is the most common option — you just need to add the Rootstock network configuration. Hardware wallets like Ledger and Trezor also support Rootstock through MetaMask.'
		},
		{
			question: 'Does BitTasker charge fees in RBTC?',
			answer:
				"BitTasker's service fee (5–10%) is deducted from the escrow payment. Gas fees for smart contract interactions are paid in RBTC and are typically under $0.01. There are no additional RBTC-specific fees beyond the standard service fee and network gas."
		}
	],
	bitTaskerCta: {
		heading: 'Start earning in Bitcoin with BitTasker',
		body: "Fund projects with RBTC, get paid in RBTC, and bridge back to BTC anytime. BitTasker's Rootstock escrow makes Bitcoin payments seamless for freelancers worldwide.",
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Get RBTC on Rootstock',
		description:
			'Step-by-step guide to bridging Bitcoin to Rootstock and obtaining RBTC for gas fees and smart contract interactions.',
		totalTime: 'PT15M',
		steps: [
			{
				name: 'Set up a Rootstock-compatible wallet',
				text: 'Configure MetaMask or another Ethereum-compatible wallet with the Rootstock network settings. Add the Rootstock RPC endpoint and chain ID to your wallet.'
			},
			{
				name: 'Get Bitcoin',
				text: 'Ensure you have BTC in a Bitcoin wallet. You will need enough BTC to bridge plus a small amount for the Bitcoin network transaction fee.'
			},
			{
				name: 'Use the Rootstock bridge',
				text: 'Visit the Rootstock Bridge web interface and connect your Bitcoin wallet. Specify the amount of BTC to bridge and provide your Rootstock wallet address as the destination.'
			},
			{
				name: 'Confirm transaction',
				text: 'Send the BTC to the bridge address and wait for Bitcoin network confirmations. The federated bridge processes the transfer and mints RBTC on Rootstock.'
			},
			{
				name: 'Verify RBTC balance',
				text: 'Open your Rootstock wallet (e.g., MetaMask) and verify the RBTC balance has arrived. You now have RBTC for gas fees and smart contract interactions on Rootstock.'
			}
		]
	}
};
