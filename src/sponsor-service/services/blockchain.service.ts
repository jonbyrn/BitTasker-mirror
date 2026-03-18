/**
 * Blockchain Service
 * Handles interaction with BSC blockchain (RPC calls, balance checks, transaction submission)
 */

import { ethers } from 'ethers';
import type { NetworkConfig as _NetworkConfig } from '../config/networks.js';
import { getNetworkConfig } from '../config/networks.js';

// Maximum gas price in gwei to prevent front-running attacks
// BSC typically ranges 1-10 gwei, set conservative limit
const MAX_GAS_PRICE_GWEI = 0.3;
const MAX_GAS_PRICE_WEI = BigInt(Math.floor(MAX_GAS_PRICE_GWEI * 1e9));

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber: number;
  gasUsed: string;
  status: number | null; // 1 for success, 0 for failure, null for pending
  confirmations: number;
}

export class BlockchainService {
  private providers: Map<number, ethers.AbstractProvider> = new Map();
  private chainIdVerified: Map<number, boolean> = new Map();

  getProvider(chainId: number): ethers.AbstractProvider {
    if (!this.providers.has(chainId)) {
      const config = getNetworkConfig(chainId);
      if (!config) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
      }

      const urls = [config.rpcUrl, ...(config.rpcUrls ?? [])].filter(Boolean);

      // Validate HTTPS for security
      for (const url of urls) {
        if (!url.startsWith('https://')) {
          console.warn(`Insecure RPC URL detected (non-HTTPS): ${url}`);
        }
      }

      let provider: ethers.AbstractProvider;
      if (urls.length === 1) {
        provider = new ethers.JsonRpcProvider(urls[0]);
      } else {
        const providerConfigs = urls.map((url, index) => ({
          provider: new ethers.JsonRpcProvider(url),
          priority: index + 1,
          stallTimeout: 1500,
          weight: 1
        }));
        provider = new ethers.FallbackProvider(providerConfigs, chainId);
      }

      this.providers.set(chainId, provider);
    }
    return this.providers.get(chainId)!;
  }

  /**
   * Verify chainId on first use to prevent RPC redirect attacks
   * This is called lazily on the first actual RPC call
   */
  private async ensureChainIdVerified(chainId: number, provider: ethers.AbstractProvider): Promise<void> {
    if (this.chainIdVerified.get(chainId)) {
      return;
    }

    try {
      const network = await provider.getNetwork();
      const actualChainId = Number(network.chainId);
      if (actualChainId !== chainId) {
        throw new Error(`Chain ID mismatch: expected ${chainId}, got ${actualChainId}`);
      }
      this.chainIdVerified.set(chainId, true);
    } catch (error) {
      console.error('Chain ID verification failed:', error);
      throw error;
    }
  }

  /**
   * Verify that the connected network's chainId matches the expected chainId
   * This prevents RPC redirect attacks
   */
  private async verifyChainId(provider: ethers.AbstractProvider, expectedChainId: number): Promise<void> {
    try {
      const network = await provider.getNetwork();
      const actualChainId = Number(network.chainId);
      if (actualChainId !== expectedChainId) {
        throw new Error(`Chain ID mismatch: expected ${expectedChainId}, got ${actualChainId}`);
      }
    } catch (error) {
      console.error('Chain ID verification failed:', error);
      throw error;
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice(chainId: number): Promise<string> {
    try {
      const provider = this.getProvider(chainId);
      const gasPrice = await provider.getGasPrice();
      return gasPrice.toString();
    } catch (error) {
      console.error(`Error getting gas price for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Submit signed transaction to the blockchain
   */
  async submitSignedTransaction(
    chainId: number,
    signedRawTransaction: string
  ): Promise<string> {
    try {
      const provider = this.getProvider(chainId);

      // Verify chainId to prevent RPC redirect attacks (lazy verification on first use)
      await this.ensureChainIdVerified(chainId, provider);

      // Verify EIP-155 transaction chainId matches requested chainId
      // This prevents cross-chain replay attacks
      const parsedTx = ethers.parseTransaction(signedRawTransaction);
      if (parsedTx.chainId !== undefined && Number(parsedTx.chainId) !== chainId) {
        throw new Error(`Transaction chainId mismatch: expected ${chainId}, got ${parsedTx.chainId}`);
      }

      const result = await provider.broadcastTransaction(signedRawTransaction);
      return result;
    } catch (error) {
      console.error(`Error submitting transaction to chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Submit meta-transaction to the router contract
   */
  async submitMetaTransaction(
    chainId: number,
    user: string,
    recipient: string,
    amount: string,
    nonce: number,
    deadline: number,
    signature: string
  ): Promise<string> {
    try {
      // Input validation
      if (!ethers.isAddress(user)) {
        throw new Error('Invalid user address');
      }
      if (!ethers.isAddress(recipient)) {
        throw new Error('Invalid recipient address');
      }
      if (!signature || signature.length !== 132) {
        throw new Error('Invalid signature format');
      }

      const config = getNetworkConfig(chainId);
      if (!config || !config.routerAddress) {
        throw new Error(`Router address not configured for chain ${chainId}`);
      }

      const provider = this.getProvider(chainId);

      // Verify chainId to prevent RPC redirect attacks (lazy verification on first use)
      await this.ensureChainIdVerified(chainId, provider);

      // Check gas price to prevent front-running attacks
      const currentGasPrice = await provider.getGasPrice();
      if (currentGasPrice > MAX_GAS_PRICE_WEI) {
        throw new Error(
          `Gas price too high: ${ethers.formatUnits(currentGasPrice, 'gwei')} gwei ` +
          `(max: ${MAX_GAS_PRICE_GWEI} gwei). Try again later.`
        );
      }

      const sponsorKey = process.env[`SPONSOR_PRIVATE_KEY_${chainId}`] || process.env.SPONSOR_PRIVATE_KEY;
      if (!sponsorKey) {
        throw new Error(`Sponsor private key not configured for chain ${chainId}`);
      }

      const wallet = new ethers.Wallet(sponsorKey, provider);

      const abi = [
        'function route(address user, address recipient, uint256 amount, uint256 nonce, uint256 deadline, bytes signature)'
      ];
      const contract = new ethers.Contract(config.routerAddress, abi, wallet);

      const tx = await contract.route(user, recipient, amount, nonce, deadline, signature);
      return tx.hash;
    } catch (error) {
      console.error(`Error submitting meta-transaction to chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(
    chainId: number,
    txHash: string
  ): Promise<TransactionReceipt | null> {
    try {
      const provider = this.getProvider(chainId);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return null;
      }

      return {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status,
        confirmations: receipt.confirmations || 0
      };
    } catch (error) {
      console.error(`Error getting receipt for ${txHash}:`, error);
      throw error;
    }
  }

  /**
   * Poll for transaction confirmation
   */
  async waitForConfirmation(
    chainId: number,
    txHash: string,
    _minConfirmations: number = 1,
    pollInterval: number = 2000,
    maxRetries: number = 15
  ): Promise<TransactionReceipt> {
    let retries = 0;

    while (retries < maxRetries) {
      const receipt = await this.getTransactionReceipt(chainId, txHash);

      if (receipt && receipt.status !== null) {
        // Transaction has been mined
        if (receipt.status === 1) {
          // Success
          return receipt;
        } else {
          // Failed
          throw new Error(`Transaction failed: ${txHash}`);
        }
      }

      retries++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Transaction confirmation timeout: ${txHash}`);
  }

  /**
   * Get account balance
   */
  async getBalance(chainId: number, address: string): Promise<string> {
    try {
      const provider = this.getProvider(chainId);
      const balance = await provider.getBalance(address);
      return balance.toString();
    } catch (error) {
      console.error(`Error getting balance for ${address}:`, error);
      throw error;
    }
  }

  /**
   * Get ERC-20 token balance
   */
  async getTokenBalance(
    chainId: number,
    tokenAddress: string,
    ownerAddress: string
  ): Promise<string> {
    try {
      const provider = this.getProvider(chainId);

      // Simple ERC-20 balanceOf call
      const abi = ['function balanceOf(address) view returns (uint256)'];
      const contract = new ethers.Contract(tokenAddress, abi, provider);
      const balance = await contract.balanceOf(ownerAddress);

      return balance.toString();
    } catch (error) {
      console.error(
        `Error getting token balance for ${ownerAddress} on token ${tokenAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get network chain ID (for validation)
   */
  async getChainId(chainId: number): Promise<number> {
    try {
      const provider = this.getProvider(chainId);
      const network = await provider.getNetwork();
      return network.chainId;
    } catch (error) {
      console.error(`Error getting chain ID:`, error);
      throw error;
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(chainId: number): Promise<number> {
    try {
      const provider = this.getProvider(chainId);
      return await provider.getBlockNumber();
    } catch (error) {
      console.error(`Error getting block number for chain ${chainId}:`, error);
      throw error;
    }
  }

  /**
   * Clear provider cache (useful for testing)
   */
  clearCache(): void {
    this.providers.clear();
  }
}

export const blockchainService = new BlockchainService();
