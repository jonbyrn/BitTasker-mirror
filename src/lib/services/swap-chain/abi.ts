/**
 * Swap Chain — Centralized ABI Encoding
 *
 * Pre-built ethers Interface instances for Boltz EtherSwap and ERC20Swap
 * contract calls. Avoids repeated `new ethers.Interface(...)` construction
 * at every call site.
 *
 * All `bytes32` parameters MUST include the `0x` prefix.
 */

import { ethers } from 'ethers';

// ─── ABI definitions ──────────────────────────────────────────────

const ETHERSWAP_LOCK_ABI = [
	'function lock(bytes32 preimageHash, address claimAddress, uint256 timelock) payable'
];

/**
 * EtherSwap.claim(bytes32, uint256, address, uint256) — RSK rBTC claim
 *
 * The 3rd parameter is `refundAddress` (the address that locked = Boltz).
 * The `claimAddress` (who receives the funds) is implicitly `msg.sender`.
 */
const ETHERSWAP_CLAIM_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address refundAddress, uint256 timelock)'
];

/** ERC20Swap.lock(bytes32, uint256, address, address, uint256) — Arbitrum tBTC lockup for chain swap.
 *  The contract pulls tokens via transferFrom (requires prior approve). */
const ERC20SWAP_LOCK_ABI = [
	'function lock(bytes32 preimageHash, uint256 amount, address tokenAddress, address claimAddress, uint256 timelock) external'
];

/** ERC20Swap.lockPrepayMinerfee(bytes32, uint256, address, address, uint256) — lock + forward ETH to claim address.
 *  Used for ERC-20 chain swaps where Boltz needs gas to claim on Arbitrum. */
const ERC20SWAP_LOCK_PREPAY_ABI = [
	'function lockPrepayMinerfee(bytes32 preimageHash, uint256 amount, address tokenAddress, address payable claimAddress, uint256 timelock) external payable'
];

/** ERC20Swap.claim(bytes32, uint256, address, address, address, uint256) — Arbitrum tBTC claim */
const ERC20SWAP_CLAIM_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address claimAddress, address refundAddress, uint256 timelock)'
];

/**
 * ERC20Swap.claim() with EIP-712 signature — the relay/msg.sender claims the
 * tokens on behalf of the claim address named in the signature, then the
 * contract sends tokens to msg.sender. Lets a smart wallet (EIP-7702
 * account or ERC-4337 paymaster) claim without being the locked claimAddress.
 *
 * Selector: 0xb2b78df8
 */
const ERC20SWAP_CLAIM_SIG_ABI = [
	'function claim(bytes32 preimage, uint256 amount, address tokenAddress, address refundAddress, uint256 timelock, uint8 v, bytes32 r, bytes32 s) external returns (address)'
];

const ETHERSWAP_REFUND_ABI = [
	'function refund(bytes32 preimageHash, address claimAddress, uint256 timelock)'
];

/** Standard ERC-20 transfer(address, uint256) */
const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

/** Standard ERC-20 approve(address, uint256) */
const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

/** Uniswap V3 SwapRouter.exactInputSingle — single-hop swap */
const UNISWAP_V3_EXACT_INPUT_SINGLE_ABI = [
	'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

/** Uniswap V3 SwapRouter.exactInput — multi-hop swap (path encoded as tokenA+fee+tokenB+fee+tokenC) */
const UNISWAP_V3_EXACT_INPUT_ABI = [
	'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)'
];

/** Simple7702Account.executeBatch — batch multiple calls in one UserOp */
const EXECUTE_BATCH_ABI = [
	'function executeBatch((address target, uint256 value, bytes data)[] calls)'
];

// ─── Singleton Interface instances ────────────────────────────────

const lockInterface = new ethers.Interface(ETHERSWAP_LOCK_ABI);
const erc20LockInterface = new ethers.Interface(ERC20SWAP_LOCK_ABI);
const erc20LockPrepayInterface = new ethers.Interface(ERC20SWAP_LOCK_PREPAY_ABI);
const etherClaimInterface = new ethers.Interface(ETHERSWAP_CLAIM_ABI);
const erc20ClaimInterface = new ethers.Interface(ERC20SWAP_CLAIM_ABI);
const erc20ClaimSigInterface = new ethers.Interface(ERC20SWAP_CLAIM_SIG_ABI);
const refundInterface = new ethers.Interface(ETHERSWAP_REFUND_ABI);
const erc20TransferInterface = new ethers.Interface(ERC20_TRANSFER_ABI);
const erc20ApproveInterface = new ethers.Interface(ERC20_APPROVE_ABI);
const uniswapV3ExactInputSingleInterface = new ethers.Interface(UNISWAP_V3_EXACT_INPUT_SINGLE_ABI);
const uniswapV3ExactInputInterface = new ethers.Interface(UNISWAP_V3_EXACT_INPUT_ABI);
const executeBatchInterface = new ethers.Interface(EXECUTE_BATCH_ABI);

// ─── Encoding functions ───────────────────────────────────────────

/**
 * ABI-encode an EtherSwap.lock() call.
 * The EtherSwap contract holds rBTC until Boltz claims using the preimage.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param claimAddress - Boltz claim address
 * @param timelock - Block height after which refund is possible
 */
export function encodeEtherSwapLock(
	preimageHash: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return lockInterface.encodeFunctionData('lock', [preimageHash, claimAddress, BigInt(timelock)]);
}

/**
 * ABI-encode an EtherSwap.claim() call (RSK rBTC claim).
 *
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Amount in wei
 * @param claimAddress - Address to receive the claimed funds
 * @param timelock - Original timelock value from the lock
 */
export function encodeEtherSwapClaim(
	preimage: string,
	amount: bigint,
	claimAddress: string,
	timelock: number | bigint
): string {
	return etherClaimInterface.encodeFunctionData('claim', [
		preimage,
		amount,
		claimAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an ERC20Swap.claim() call (Arbitrum tBTC claim).
 *
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Token amount (in smallest unit)
 * @param tokenAddress - ERC-20 token contract address
 * @param claimAddress - Address to receive the claimed tokens
 * @param refundAddress - Address that can refund if timelock expires
 * @param timelock - Original timelock value from the lock
 */
export function encodeERC20SwapClaim(
	preimage: string,
	amount: bigint,
	tokenAddress: string,
	claimAddress: string,
	refundAddress: string,
	timelock: number | bigint
): string {
	return erc20ClaimInterface.encodeFunctionData('claim', [
		preimage,
		amount,
		tokenAddress,
		claimAddress,
		refundAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an ERC20Swap.claim() call using the EIP-712 signature variant.
 *
 * In this variant the claim address is recovered from the signature, so the
 * caller (msg.sender) can be a smart wallet / relay rather than the claim
 * address itself. The contract sends the tokens to msg.sender.
 *
 * Selector: 0xb2b78df8
 *
 * @param preimage - Preimage secret (bytes32, with `0x` prefix)
 * @param amount - Token amount (in smallest unit)
 * @param tokenAddress - ERC-20 token contract address
 * @param refundAddress - Address that can refund if timelock expires
 * @param timelock - Original timelock value from the lock
 * @param v - EIP-712 signature recovery id
 * @param r - EIP-712 signature r component (bytes32)
 * @param s - EIP-712 signature s component (bytes32)
 */
export function encodeERC20SwapClaimWithSig(
	preimage: string,
	amount: bigint,
	tokenAddress: string,
	refundAddress: string,
	timelock: number | bigint,
	v: number,
	r: string,
	s: string
): string {
	return erc20ClaimSigInterface.encodeFunctionData('claim', [
		preimage,
		amount,
		tokenAddress,
		refundAddress,
		BigInt(timelock),
		v,
		r,
		s
	]);
}

/**
 * ABI-encode an ERC20Swap.lock() call.
 * The ERC20Swap contract on Arbitrum holds tBTC until Boltz claims using the preimage.
 * Requires prior ERC-20 approve() on the tBTC contract for the lockup address.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param amount - Token amount in smallest unit
 * @param tokenAddress - ERC-20 token contract address (tBTC on Arbitrum)
 * @param claimAddress - Boltz claim address (from lockupDetails.claimAddress)
 * @param timelock - Block height after which refund is possible
 */
export function encodeERC20SwapLock(
	preimageHash: string,
	amount: bigint,
	tokenAddress: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return erc20LockInterface.encodeFunctionData('lock', [
		preimageHash,
		amount,
		tokenAddress,
		claimAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an ERC20Swap.lockPrepayMinerfee() call.
 * Locks ERC-20 tokens AND forwards ETH to the claim address (Boltz) to cover gas.
 * Used for ERC-20 chain swaps where Boltz needs ETH on the source chain to claim.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param amount - Token amount in smallest unit
 * @param tokenAddress - ERC-20 token contract address (tBTC on Arbitrum)
 * @param claimAddress - Boltz claim address (from lockupDetails.claimAddress)
 * @param timelock - Block height after which refund is possible
 */
export function encodeERC20SwapLockPrepay(
	preimageHash: string,
	amount: bigint,
	tokenAddress: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return erc20LockPrepayInterface.encodeFunctionData('lockPrepayMinerfee', [
		preimageHash,
		amount,
		tokenAddress,
		claimAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode an ERC-20 approve() call.
 * Must be called before ERC20Swap.lock() to allow the contract to pull tokens.
 *
 * @param spender - The Boltz lockup contract address
 * @param amount - Token amount to approve
 */
export function encodeERC20Approve(spender: string, amount: bigint): string {
	return erc20ApproveInterface.encodeFunctionData('approve', [spender, amount]);
}

/**
 * ABI-encode an ERC-20 transfer() call.
 * Used to send ERC-20 tokens (e.g. tBTC) to a Boltz lockup address.
 *
 * @param to - Recipient address (Boltz lockup address)
 * @param amount - Token amount in smallest unit
 */
export function encodeERC20Transfer(to: string, amount: bigint): string {
	return erc20TransferInterface.encodeFunctionData('transfer', [to, amount]);
}

/**
 * ABI-encode an EtherSwap.refund() call.
 *
 * @param preimageHash - SHA-256 hash of the preimage (bytes32, with `0x` prefix)
 * @param claimAddress - Original claim address from the lock
 * @param timelock - Original timelock value from the lock
 */
export function encodeEtherSwapRefund(
	preimageHash: string,
	claimAddress: string,
	timelock: number | bigint
): string {
	return refundInterface.encodeFunctionData('refund', [
		preimageHash,
		claimAddress,
		BigInt(timelock)
	]);
}

/**
 * ABI-encode a Uniswap V3 SwapRouter.exactInputSingle() call.
 *
 * @param tokenIn - Source token address
 * @param tokenOut - Destination token address
 * @param fee - Pool fee tier (e.g. 500 for 0.05%)
 * @param recipient - Address to receive output tokens
 * @param deadline - Unix timestamp deadline
 * @param amountIn - Input amount in smallest unit
 * @param amountOutMinimum - Minimum output (0 = accept any, use with caution)
 */
export function encodeUniswapV3ExactInputSingle(
	tokenIn: string,
	tokenOut: string,
	fee: number,
	recipient: string,
	deadline: bigint,
	amountIn: bigint,
	amountOutMinimum: bigint
): string {
	return uniswapV3ExactInputSingleInterface.encodeFunctionData('exactInputSingle', [
		{
			tokenIn,
			tokenOut,
			fee,
			recipient,
			deadline,
			amountIn,
			amountOutMinimum,
			sqrtPriceLimitX96: 0n
		}
	]);
}

/**
 * ABI-encode a Uniswap V3 SwapRouter.exactInput() call (multi-hop swap).
 *
 * @param path - Encoded multi-hop path (tokenA + fee + tokenB + fee + tokenC)
 * @param recipient - Address to receive output tokens
 * @param deadline - Unix timestamp deadline
 * @param amountIn - Input amount in smallest unit
 * @param amountOutMinimum - Minimum output (0 = accept any, use with caution)
 */
export function encodeUniswapV3ExactInput(
	path: string,
	recipient: string,
	deadline: bigint,
	amountIn: bigint,
	amountOutMinimum: bigint
): string {
	return uniswapV3ExactInputInterface.encodeFunctionData('exactInput', [
		{
			path,
			recipient,
			deadline,
			amountIn,
			amountOutMinimum
		}
	]);
}

/**
 * ABI-encode an executeBatch() call that groups multiple contract calls
 * into a single UserOp. Used to batch approve + lock in one gasless transaction.
 *
 * @param calls - Array of { to, value, data } tuples
 * @returns ABI-encoded executeBatch calldata
 */
export function buildExecuteBatchCallData(
	calls: Array<{ to: string; value: bigint; data: string }>
): string {
	return executeBatchInterface.encodeFunctionData('executeBatch', [
		calls.map((c) => [c.to, c.value, c.data])
	]);
}
