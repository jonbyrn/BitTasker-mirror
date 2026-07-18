// ArbitrumWallet — wallet-core SDK extension for Arbitrum One
// Follows existing BSCWallet/RSKWallet pattern.
// Handles: provider, balances, ERC-20 reads. NO AA logic (that lives in app layer).
import { ethers } from 'ethers';
import { ARBITRUM_CHAIN_ID, TOKENS, ARBITRUM_RPC_URL } from './gasless.config';

const ERC20_ABI = [
	'function balanceOf(address) view returns (uint256)',
	'function decimals() view returns (uint8)',
	'function symbol() view returns (string)',
	'function transfer(address,uint256) returns (bool)'
];

export class ArbitrumWallet {
	private provider: ethers.JsonRpcProvider;
	private wallet: ethers.Wallet;

	constructor(privateKey: string, rpcUrl: string = ARBITRUM_RPC_URL) {
		if (!rpcUrl) throw new Error('ARBITRUM_RPC_URL is required');
		this.provider = new ethers.JsonRpcProvider(rpcUrl, ARBITRUM_CHAIN_ID);
		this.wallet = new ethers.Wallet(privateKey, this.provider);
	}

	getAddress(): string {
		return this.wallet.address;
	}

	async getETHBalance(): Promise<string> {
		const balance = await this.provider.getBalance(this.wallet.address);
		return ethers.formatEther(balance);
	}

	async getTokenBalance(tokenAddress: string, decimals?: number): Promise<string> {
		const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
		const balance: bigint = await contract.balanceOf(this.wallet.address);
		const dec = decimals ?? (await contract.decimals());
		return ethers.formatUnits(balance, dec);
	}

	async getAllTokenBalances(): Promise<
		Array<{ symbol: string; address: string; balance: string; decimals: number }>
	> {
		const results = await Promise.all(
			TOKENS.map(async (token) => {
				try {
					const balance = await this.getTokenBalance(token.address, token.decimals);
					return {
						symbol: token.symbol,
						address: token.address,
						balance,
						decimals: token.decimals
					};
				} catch {
					return {
						symbol: token.symbol,
						address: token.address,
						balance: '0',
						decimals: token.decimals
					};
				}
			})
		);
		return results;
	}

	getProvider(): ethers.JsonRpcProvider {
		return this.provider;
	}

	getWallet(): ethers.Wallet {
		return this.wallet;
	}
}
