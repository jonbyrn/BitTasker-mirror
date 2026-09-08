import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'Stablecoins Explained: USDT, USDC, and DAI Guide',
		subtitle:
			'What stablecoins are, how they maintain their peg, and why they matter for freelancers in 2026.'
	},
	answerBlock:
		'Stablecoins are cryptocurrencies designed to maintain a stable value, typically pegged 1:1 to the US dollar. The three main types are fiat-backed (USDT, USDC — reserves held in banks), crypto-collateralized (DAI — over-collateralized by ETH on MakerDAO), and algorithmic (supply-adjusted by code, though many have failed). For freelancers, stablecoins offer the speed and borderlessness of crypto without the volatility of Bitcoin or Ethereum. You can receive payment in USDC, hold it without price risk, and convert to local currency when needed. BitTasker supports stablecoin payments alongside Bitcoin and Lightning, giving freelancers flexibility to choose their preferred denomination.',
	sections: [
		{
			heading: 'What are stablecoins and why do they exist?',
			body: "Stablecoins solve a fundamental problem in crypto: volatility. Bitcoin's price can swing 5-10% in a day, making it impractical for pricing goods, paying rent, or running a business. Stablecoins peg their value to a stable asset — usually the US dollar — combining crypto's benefits (fast transfers, global accessibility, programmability) with fiat's stability. For freelancers, this means you can receive $500 in USDC and know it's still worth $500 tomorrow. Stablecoins are also essential for DeFi: lending protocols, DEXs, and yield farms all operate in stablecoin-denominated liquidity pools. The total stablecoin market cap exceeds $150 billion, making them one of crypto's most widely adopted use cases."
		},
		{
			heading: 'How do stablecoins maintain their peg?',
			body: 'Fiat-backed stablecoins (USDT, USDC) maintain their peg by holding reserves equivalent to the total supply. Tether (USDT) claims to hold US Treasury bills, cash, and other assets backing every token. Circle (USDC) publishes monthly attestations showing reserves in short-term US government bonds and cash. If demand increases, new tokens are minted and reserves increase. If demand decreases, tokens are burned and reserves decrease. Crypto-collateralized stablecoins (DAI) work differently: users deposit ETH (or other crypto) as collateral at 150%+ of the stablecoin value, creating a buffer against price drops. If collateral falls below the required ratio, it gets liquidated. Algorithmic stablecoins attempt to maintain peg through supply manipulation — minting when above peg, burning when below — but many (like TerraUSD) have failed catastrophically.'
		},
		{
			heading: 'USDT vs USDC vs DAI: which should you use?',
			body: "USDT (Tether) is the largest stablecoin by market cap and trading volume, offering the deepest liquidity across exchanges. However, its reserve transparency has been historically questioned, though recent audits have improved confidence. USDC (Circle) is the most transparent stablecoin, with monthly reserve attestations and regulatory compliance in the US. It's preferred by institutions and regulated platforms. DAI (MakerDAO) is fully decentralized — no company controls it, and reserves are transparent on-chain. However, DAI requires over-collateralization (150%+), making capital efficiency lower. For freelancers: USDC offers the best balance of transparency and liquidity. USDT is widely accepted but less transparent. DAI is fully decentralized but requires more capital lock-up."
		},
		{
			heading: 'How do stablecoins improve remittances and cross-border payments?',
			body: 'Stablecoins have become the preferred method for cross-border payments, especially in Latin America. Traditional remittance services (Western Union, MoneyGram) charge 5-10% fees and take 3-5 business days. Stablecoin transfers settle in minutes for under $1 in fees. In countries like Argentina, Venezuela, and Colombia, stablecoins serve as a practical dollar access point — citizens can receive USDC from abroad and hold value in a dollar-equivalent asset without needing a US bank account. For freelancers in Latin America, stablecoins solve two problems: getting paid by international clients without wire transfer delays, and preserving earnings against local currency devaluation. BitTasker supports USDC payments alongside Bitcoin, giving freelancers the flexibility to choose based on their needs.'
		},
		{
			heading: 'Can you use stablecoins on Bitcoin?',
			body: "While most stablecoins run on Ethereum or Tron, Tether (USDT) is also available on the Liquid Network — a Bitcoin sidechain developed by Blockstream. Liquid USDt offers the same 1:1 USD peg as ERC-20 USDT but runs on a Bitcoin-secured network with faster block times (1 minute vs 12+ minutes) and confidential transactions. For the Bitcoin ecosystem, Liquid USDt brings stablecoin utility without leaving Bitcoin's security model. BitTasker's integration with Bitcoin sidechains means freelancers can potentially receive stablecoin payments on Bitcoin-secured networks, combining the stability of dollar-pegged assets with Bitcoin's security guarantees."
		},
		{
			heading: 'What are the risks of using stablecoins?',
			body: "Stablecoins carry real risks. Depegging occurs when a stablecoin trades below its intended peg — USDC briefly depegged to $0.87 during the Silicon Valley Bank crisis in March 2023 due to $3.3B in reserves being held at the failed bank. Algorithmic stablecoins are most vulnerable: TerraUSD's collapse in May 2022 wiped out $40B in value. Regulatory risk is increasing: the EU's MiCA framework imposes strict requirements on stablecoin issuers, and US regulations continue to evolve. Counterparty risk applies to fiat-backed stablecoins — you're trusting the issuer to hold adequate reserves. For freelancers, the practical risk is relatively low with major stablecoins (USDC, USDT) for short-to-medium term holding, but long-term holding introduces regulatory and counterparty uncertainty. Diversification across stablecoins and maintaining some BTC exposure is a common risk mitigation strategy."
		},
		{
			heading: 'How does BitTasker support stablecoin payments?',
			body: "BitTasker accepts stablecoin payments alongside Bitcoin and Lightning, giving freelancers and clients flexibility in how they transact. Clients can fund escrow in USDC or other supported stablecoins, providing price predictability for project budgets. Freelancers can choose to receive payouts in stablecoins to avoid Bitcoin volatility, or in BTC to benefit from potential appreciation. The escrow smart contracts on RGB support multiple asset types, meaning the same trustless escrow mechanism works whether you're holding BTC, BTC, or stablecoins. For freelancers in volatile economies, the option to receive payment in a dollar-pegged asset while still benefiting from blockchain-based escrow and instant settlement is a powerful combination."
		}
	],
	faq: [
		{
			question: 'Are stablecoins safe?',
			answer:
				"Major stablecoins like USDC and USDT are generally considered safe for short-to-medium term holding. They're backed by reserves (US government bonds, cash) and have maintained their peg through market stress. However, they carry counterparty risk (trusting the issuer) and regulatory risk. DAI is decentralized but requires over-collateralization. No stablecoin is risk-free — they trade stability for the convenience of dollar-pegged crypto."
		},
		{
			question: 'Can I receive freelance payments in stablecoins?',
			answer:
				'Yes. BitTasker supports stablecoin payments, allowing clients to fund escrow and freelancers to receive payouts in USDC or other supported stablecoins. This is useful for freelancers who want to avoid Bitcoin volatility while still benefiting from blockchain-based payments.'
		},
		{
			question: 'What happens if a stablecoin loses its peg?',
			answer:
				'If a stablecoin depegges, its value drops below $1 temporarily (or permanently in extreme cases like TerraUSD). For freelancers, this means the purchasing power of your earnings decreases. Risk mitigation: convert to local currency promptly, diversify across stablecoins, or hold some BTC. Major stablecoins (USDC, USDT) have recovered from brief depegs, but prolonged depegging is possible.'
		},
		{
			question: 'Are stablecoins regulated?',
			answer:
				"Regulation varies by jurisdiction. The EU's MiCA framework (effective 2024) imposes strict reserve and disclosure requirements on stablecoin issuers. US regulation is evolving, with SEC and CFTC both claiming jurisdiction. Some countries (El Salvador, UAE) are more crypto-friendly. For freelancers, using stablecoins from regulated issuers (Circle, Tether) provides the most legal clarity."
		},
		{
			question: 'Do stablecoins have fees?',
			answer:
				'Stablecoin transaction fees depend on the network. Ethereum USDC transfers cost $0.50-5+ in gas fees. Tron USDT transfers cost under $1. BitTasker uses RGB for smart contracts, where transaction fees are under $0.01. There are typically no fees for receiving stablecoins, though converting to local currency may involve exchange fees.'
		},
		{
			question: 'Which stablecoin is best for freelancers?',
			answer:
				"USDC is generally recommended for freelancers due to its transparency, regulatory compliance, and strong liquidity. It's widely accepted on exchanges and platforms. For freelancers in regions with limited exchange access, USDT on Tron offers the widest merchant acceptance. DAI works for those prioritizing decentralization over convenience."
		}
	],
	bitTaskerCta: {
		heading: 'Get paid in stablecoins or Bitcoin — your choice',
		body: "BitTasker supports stablecoin payments alongside Bitcoin and Lightning. Choose the currency that works for your situation — whether that's dollar stability via USDC or Bitcoin's growth potential.",
		buttonText: 'Start Receiving Payments',
		buttonHref: '/auth/signup'
	}
};
