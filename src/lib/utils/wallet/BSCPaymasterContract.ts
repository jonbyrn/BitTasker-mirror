/**
 * BSC Paymaster Contract for EIP-7702 Gas Fee Abstraction
 * 
 * This contract allows users to pay gas fees in USDT instead of BNB
 * by implementing EIP-7702 paymaster functionality.
 */

import { ethers } from 'ethers';
import { withTimeout } from './timeoutHelpers';

// EIP-7702 Paymaster ABI
export const PAYMASTER_ABI = [
    // Core paymaster functions
    'function validatePaymasterUserOp(UserOperation userOp, bytes32 userOpHash, uint256 maxCost) external view returns (bytes memory context, uint256 validationData)',
    'function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) external',
    
    // Deposit management
    'function deposit() external payable',
    'function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external',
    'function getDeposit() external view returns (uint256)',
    
    // USDT fee payment
    'function payForTransaction(address user, bytes calldata transaction) external payable',
    'function convertUsdtToBnb(uint256 usdtAmount) external view returns (uint256 bnbAmount)',
    'function getUsdtPrice() external view returns (uint256 price)',
    
    // Events
    'event Deposit(address indexed account, uint256 totalDeposit)',
    'event Withdraw(address indexed account, uint256 withdrawAmount)',
    'event GasPaidInUsdt(address indexed user, uint256 usdtAmount, uint256 bnbEquivalent)',
    'event PriceUpdated(uint256 oldPrice, uint256 newPrice)'
];

// UserOperation structure for EIP-7702
export interface UserOperation {
    sender: string;
    nonce: bigint;
    initCode: string;
    callData: string;
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    paymasterAndData: string;
    signature: string;
}

// PostOpMode enum
export enum PostOpMode {
    opSucceeded = 0,
    opReverted = 1,
    postOpReverted = 2
}

// Paymaster configuration
export interface PaymasterConfig {
    address: string;
    usdtTokenAddress: string;
    minDeposit: bigint; // Minimum BNB deposit required
    maxGasPrice: bigint; // Maximum gas price in wei
    usdtPriceOracle: string; // Price oracle address for USDT/BNB
}

// BSC Paymaster Contract Class
export class BSCPaymasterContract {
    private contract: ethers.Contract;
    private provider: ethers.JsonRpcProvider;
    private wallet: ethers.Wallet;
    private config: PaymasterConfig;

    constructor(
        contractAddress: string,
        provider: ethers.JsonRpcProvider,
        wallet: ethers.Wallet,
        config: PaymasterConfig
    ) {
        this.contract = new ethers.Contract(contractAddress, PAYMASTER_ABI, wallet);
        this.provider = provider;
        this.wallet = wallet;
        this.config = config;
    }

    /**
     * Check if paymaster has sufficient deposit
     */
    async hasSufficientDeposit(): Promise<boolean> {
        try {
            const deposit = await this.contract.getDeposit();
            return deposit >= this.config.minDeposit;
        } catch (error) {
            console.error('Failed to check paymaster deposit:', error);
            return false;
        }
    }

    /**
     * Get current deposit amount
     */
    async getDeposit(): Promise<bigint> {
        try {
            return await this.contract.getDeposit();
        } catch (error) {
            console.error('Failed to get deposit:', error);
            return BigInt(0);
        }
    }

    /**
     * Deposit BNB to paymaster
     */
    async deposit(amount: bigint): Promise<string> {
        try {
            const tx = await this.contract.deposit({ value: amount });
            await tx.wait();
            return tx.hash;
        } catch (error) {
            throw new Error(`Failed to deposit: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Withdraw BNB from paymaster
     */
    async withdraw(amount: bigint): Promise<string> {
        try {
            const tx = await this.contract.withdrawTo(this.wallet.address, amount);
            await tx.wait();
            return tx.hash;
        } catch (error) {
            throw new Error(`Failed to withdraw: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get current USDT price in BNB
     */
    async getUsdtPrice(): Promise<bigint> {
        try {
            return await this.contract.getUsdtPrice();
        } catch (error) {
            console.error('Failed to get USDT price:', error);
            // Fallback to a default price (1 USDT = 0.0003 BNB approximately)
            return ethers.parseEther('0.0003');
        }
    }

    /**
     * Convert USDT amount to BNB equivalent
     */
    async convertUsdtToBnb(usdtAmount: bigint): Promise<bigint> {
        try {
            return await this.contract.convertUsdtToBnb(usdtAmount);
        } catch (error) {
            console.error('Failed to convert USDT to BNB:', error);
            // Fallback calculation
            const price = await this.getUsdtPrice();
            return (usdtAmount * price) / ethers.parseUnits('1', 18);
        }
    }

    /**
     * Validate if a user operation can be sponsored
     */
    async validateUserOperation(userOp: UserOperation, userOpHash: string, maxCost: bigint): Promise<{ context: string; validationData: bigint }> {
        try {
            const result = await this.contract.validatePaymasterUserOp(userOp, userOpHash, maxCost);
            return {
                context: result[0],
                validationData: result[1]
            };
        } catch (error) {
            throw new Error(`Failed to validate user operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Post-operation callback for paymaster
     */
    async postOp(mode: PostOpMode, context: string, actualGasCost: bigint): Promise<void> {
        try {
            await this.contract.postOp(mode, context, actualGasCost);
        } catch (error) {
            console.error('Failed to execute postOp:', error);
        }
    }

    /**
     * Pay for a transaction using USDT
     * This is a simplified implementation - in practice, you'd need to implement
     * the full EIP-7702 flow with UserOperation and paymaster validation
     */
    async payForTransactionWithUsdt(transactionData: string, usdtAmount: bigint): Promise<string> {
        try {
            // First, approve the paymaster to spend USDT
            const usdtContract = new ethers.Contract(
                this.config.usdtTokenAddress,
                [
                    'function approve(address spender, uint256 amount) returns (bool)',
                    'function transferFrom(address from, address to, uint256 amount) returns (bool)'
                ],
                this.wallet
            );

            // Approve USDT spending
            const approveTx = await usdtContract.approve(this.contract.target as string, usdtAmount);
            await approveTx.wait();

            // Pay for the transaction
            const tx = await this.contract.payForTransaction(this.wallet.address, transactionData, { value: usdtAmount });
            await tx.wait();
            return tx.hash;
        } catch (error) {
            throw new Error(`Failed to pay for transaction with USDT: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Estimate USDT cost for a transaction
     */
    async estimateUsdtCost(gasLimit: bigint, gasPrice: bigint): Promise<bigint> {
        try {
            const bnbCost = gasLimit * gasPrice;
            const usdtPrice = await this.getUsdtPrice();
            
            // Convert BNB cost to USDT
            return (bnbCost * ethers.parseUnits('1', 18)) / usdtPrice;
        } catch (error) {
            console.error('Failed to estimate USDT cost:', error);
            // Fallback calculation
            const bnbCost = gasLimit * gasPrice;
            return (bnbCost * ethers.parseUnits('1', 18)) / ethers.parseEther('0.0003');
        }
    }

    /**
     * Check if user can pay fees in USDT
     */
    async canPayFeesInUsdt(): Promise<boolean> {
        try {
            const hasDeposit = await this.hasSufficientDeposit();
            if (!hasDeposit) return false;

            // Check if user has sufficient USDT balance
            const usdtContract = new ethers.Contract(
                this.config.usdtTokenAddress,
                ['function balanceOf(address owner) view returns (uint256)'],
                this.provider
            );

            const balance = await usdtContract.balanceOf(this.wallet.address);
            const minUsdtBalance = ethers.parseUnits('10', 18); // Minimum 10 USDT

            return balance >= minUsdtBalance;
        } catch (error) {
            console.error('Failed to check USDT payment capability:', error);
            return false;
        }
    }

    /**
     * Get paymaster status and capabilities
     */
    async getStatus(): Promise<{
        hasDeposit: boolean;
        depositAmount: bigint;
        canPayInUsdt: boolean;
        usdtPrice: bigint;
        minDeposit: bigint;
    }> {
        try {
            // Add 2-second timeout per call, 8 seconds total
            const [hasDeposit, depositAmount, canPayInUsdt, usdtPrice] = await Promise.all([
                withTimeout(this.hasSufficientDeposit(), 2000, 'Timeout checking deposit'),
                withTimeout(this.getDeposit(), 2000, 'Timeout getting deposit amount'),
                withTimeout(this.canPayFeesInUsdt(), 2000, 'Timeout checking USDT payment'),
                withTimeout(this.getUsdtPrice(), 2000, 'Timeout getting USDT price')
            ]);

            return {
                hasDeposit,
                depositAmount,
                canPayInUsdt,
                usdtPrice,
                minDeposit: this.config.minDeposit
            };
        } catch (error) {
            console.error('Failed to get paymaster status:', error);
            return {
                hasDeposit: false,
                depositAmount: BigInt(0),
                canPayInUsdt: false,
                usdtPrice: ethers.parseEther('0.0003'),
                minDeposit: this.config.minDeposit
            };
        }
    }
}

// Default paymaster configurations for BSC networks
export const BSC_PAYMASTER_CONFIGS = {
    mainnet: {
        address: '0x0000000000000000000000000000000000000000', // Placeholder - needs to be deployed
        usdtTokenAddress: '0x55d398326f99059fF775485246999027B3197955',
        minDeposit: ethers.parseEther('1'), // 1 BNB minimum deposit
        maxGasPrice: ethers.parseUnits('50', 'gwei'), // 50 gwei max gas price
        usdtPriceOracle: '0x0000000000000000000000000000000000000000' // Placeholder
    },
    testnet: {
        address: '0x0000000000000000000000000000000000000000', // Placeholder - needs to be deployed
        usdtTokenAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
        minDeposit: ethers.parseEther('0.1'), // 0.1 BNB minimum deposit
        maxGasPrice: ethers.parseUnits('20', 'gwei'), // 20 gwei max gas price
        usdtPriceOracle: '0x0000000000000000000000000000000000000000' // Placeholder
    }
} as const;
