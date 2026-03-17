/**
 * Paymaster/Sponsor Integration Tests
 *
 * Tests the complete flow:
 * 1. User signs transfer request off-chain (no BNB needed)
 * 2. Sponsor/relayer picks up signed request
 * 3. Sponsor submits transaction to contract (pays BNB gas)
 * 4. Contract verifies signature and executes transfer
 * 5. Treasury receives fee in USDT
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DirectSendRouter, ERC20Mock } from '../typechain-types';
import type { SignerWithAddress, Signer } from '@nomicfoundation/hardhat-ethers/signers';
import type { TypedDataDomain, TypedDataField } from 'ethers';

describe('Paymaster/Sponsor Integration Tests', () => {
	let router: DirectSendRouter;
	let usdt: ERC20Mock;
	let owner: SignerWithAddress;
	let user: Signer;
	let recipient: SignerWithAddress;
	let treasury: SignerWithAddress;
	let sponsor: SignerWithAddress;

	const FIXED_FEE = ethers.parseUnits('1', 6); // $0.01
	const TRANSFER_AMOUNT = ethers.parseUnits('100', 6);

	// EIP-712 types
	let domain: TypedDataDomain;
	let types: Record<string, TypedDataField[]>;

	beforeEach(async () => {
		[owner, recipient, treasury, sponsor] = await ethers.getSigners();

		const userWallet = ethers.Wallet.createRandom();
		user = userWallet.connect(ethers.provider);

		await owner.sendTransaction({
			to: await user.getAddress(),
			value: ethers.parseEther('1')
		});

		// Deploy contracts
		const USDTFactory = await ethers.getContractFactory('ERC20Mock');
		usdt = await USDTFactory.deploy();

		const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
		router = await RouterFactory.deploy(
			await usdt.getAddress(),
			await treasury.getAddress(),
			FIXED_FEE,
			await sponsor.getAddress()
		);

		// Setup user with USDT and approval
		await usdt.mint(await user.getAddress(), ethers.parseUnits('10000', 6));
		await usdt.connect(user).approve(await router.getAddress(), ethers.parseUnits('20000', 6));

		// Setup EIP-712 domain
		domain = {
			name: 'DirectSendRouter',
			version: '1',
			chainId: (await ethers.provider.getNetwork()).chainId.toString(),
			verifyingContract: await router.getAddress()
		};

		types = {
			TransferRequest: [
				{ name: 'user', type: 'address' },
				{ name: 'recipient', type: 'address' },
				{ name: 'amount', type: 'uint256' },
				{ name: 'nonce', type: 'uint256' },
				{ name: 'deadline', type: 'uint256' }
			]
		};
	});

	// Helper function to sign transfer requests
	async function signTransfer(
		userWallet: Signer,
		recipientAddr: string,
		amount: bigint,
		nonce: number,
		deadline: bigint
	): Promise<string> {
		const message = {
			user: await userWallet.getAddress(),
			recipient: recipientAddr,
			amount: amount,
			nonce: nonce,
			deadline: deadline
		};

		return await userWallet.signTypedData(domain, types, message);
	}

	describe('Complete User Flow', () => {
		it('should execute full transfer flow: sign -> relay -> verify -> transfer', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const nonce = 0;

			// Step 1: User signs transfer request (off-chain, 0 BNB)
			const signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			// Capture initial balances
			const userBalanceBefore = await usdt.balanceOf(await user.getAddress());
			const recipientBalanceBefore = await usdt.balanceOf(await recipient.getAddress());
			const treasuryBalanceBefore = await usdt.balanceOf(await treasury.getAddress());

			// Step 2: Sponsor submits transaction (pays BNB gas)
			const tx = await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			const receipt = await tx.wait();

			// Step 3: Verify execution
			const userBalanceAfter = await usdt.balanceOf(await user.getAddress());
			const recipientBalanceAfter = await usdt.balanceOf(await recipient.getAddress());
			const treasuryBalanceAfter = await usdt.balanceOf(await treasury.getAddress());

			// Verify recipient got the amount
			expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + TRANSFER_AMOUNT);

			// Verify treasury got the fee
			expect(treasuryBalanceAfter).to.equal(treasuryBalanceBefore + FIXED_FEE);

			// Verify user balance decreased by amount + fee
			expect(userBalanceAfter).to.equal(userBalanceBefore - TRANSFER_AMOUNT - FIXED_FEE);

			// Verify nonce incremented
			expect(await router.nonces(await user.getAddress())).to.equal(1);

			// Log gas used
			console.log(`Gas used for meta-transaction: ${receipt?.gasUsed}`);
		});

		it('should handle batch of transfers from same user', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// Execute 5 transfers
			for (let i = 0; i < 5; i++) {
				const signature = await signTransfer(
					user,
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					i,
					deadline
				);

				await router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						i,
						deadline,
						signature
					);
			}

			// Verify final state
			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(TRANSFER_AMOUNT * 5n);
			expect(await usdt.balanceOf(await treasury.getAddress())).to.equal(FIXED_FEE * 5n);
			expect(await router.nonces(await user.getAddress())).to.equal(5);
		});

		it('should work with different recipients', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// We already have recipient from the outer scope signers list
			// [owner, recipient, treasury, sponsor] = await ethers.getSigners();
			// Let's get 3 more unique ones
			const signers = await ethers.getSigners();
			const rec1 = signers[4];
			const rec2 = signers[5];
			const rec3 = signers[6];

			// Transfer to recipient 1
			let signature = await signTransfer(
				user,
				await rec1.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await rec1.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					signature
				);

			// Transfer to recipient 2
			signature = await signTransfer(user, await rec2.getAddress(), TRANSFER_AMOUNT, 1, deadline);
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await rec2.getAddress(),
					TRANSFER_AMOUNT,
					1,
					deadline,
					signature
				);

			// Transfer to recipient 3
			signature = await signTransfer(user, await rec3.getAddress(), TRANSFER_AMOUNT, 2, deadline);
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await rec3.getAddress(),
					TRANSFER_AMOUNT,
					2,
					deadline,
					signature
				);

			// Verify all recipients got funds
			expect(await usdt.balanceOf(await rec1.getAddress())).to.equal(TRANSFER_AMOUNT);
			expect(await usdt.balanceOf(await rec2.getAddress())).to.equal(TRANSFER_AMOUNT);
			expect(await usdt.balanceOf(await rec3.getAddress())).to.equal(TRANSFER_AMOUNT);

			// Verify treasury got all fees
			// Initial balance might not be 0 because of previous tests in same file
			// Wait, each it() has its own beforeEach, but the signers are global.
			// However, we are checking USdt balance which is a freshly deployed contract in beforeEach.
			expect(await usdt.balanceOf(await treasury.getAddress())).to.equal(FIXED_FEE * 3n);
		});
	});

	describe('Gas Analysis', () => {
		it('should measure gas for first transaction', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			const tx = await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					signature
				);

			const receipt = await tx.wait();
			const gasUsed = receipt?.gasUsed || 0n;

			console.log(`First transaction gas: ${gasUsed}`);
			expect(gasUsed).to.be.lessThan(150000n);
		});

		it('should measure gas for subsequent transactions (warm cache)', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// First transaction (cold)
			let signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			let tx = await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					signature
				);
			let receipt = await tx.wait();
			console.log(`First transaction gas (cold): ${receipt?.gasUsed}`);

			// Second transaction (warm)
			signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				1,
				deadline
			);
			tx = await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					1,
					deadline,
					signature
				);
			receipt = await tx.wait();
			console.log(`Second transaction gas (warm): ${receipt?.gasUsed}`);

			// Warm should be cheaper
			expect(receipt?.gasUsed).to.be.lessThan(100000n);
		});
	});

	describe('Error Handling', () => {
		it('should handle invalid signature gracefully', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			// Sign a valid request (for context)
			await signTransfer(user, await recipient.getAddress(), TRANSFER_AMOUNT, 0, deadline);

			// Tamper with signature
			const tamperedSig = '0x' + '00'.repeat(65);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						tamperedSig
					)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});

		it('should handle expired deadline gracefully', async () => {
			const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 100);
			const signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				expiredDeadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						expiredDeadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ExpiredDeadline');
		});

		it('should handle insufficient balance gracefully', async () => {
			const poorUser = ethers.Wallet.createRandom().connect(ethers.provider);
			await owner.sendTransaction({
				to: await poorUser.getAddress(),
				value: ethers.parseEther('1')
			});

			await usdt.mint(await poorUser.getAddress(), FIXED_FEE); // Only fee, no amount
			await usdt.connect(poorUser).approve(await router.getAddress(), FIXED_FEE);

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransfer(
				poorUser,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await poorUser.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InsufficientBalance');
		});

		it('should handle contract paused gracefully', async () => {
			// Pause the contract
			await router.connect(owner).pause();

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ContractPaused');
		});
	});

	describe('Multi-User Scenarios', () => {
		it('should handle multiple users independently', async () => {
			const user2 = ethers.Wallet.createRandom().connect(ethers.provider);
			const user3 = ethers.Wallet.createRandom().connect(ethers.provider);

			// Give them ETH
			await owner.sendTransaction({ to: await user2.getAddress(), value: ethers.parseEther('1') });
			await owner.sendTransaction({ to: await user3.getAddress(), value: ethers.parseEther('1') });

			// Fund additional users
			await usdt.mint(await user2.getAddress(), ethers.parseUnits('5000', 6));
			await usdt.mint(await user3.getAddress(), ethers.parseUnits('3000', 6));
			await usdt.connect(user2).approve(await router.getAddress(), ethers.parseUnits('5000', 6));
			await usdt.connect(user3).approve(await router.getAddress(), ethers.parseUnits('3000', 6));

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// User 1 transfer
			let sig = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					sig
				);

			// User 2 transfer
			sig = await signTransfer(
				user2,
				await recipient.getAddress(),
				ethers.parseUnits('50', 6),
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user2.getAddress(),
					await recipient.getAddress(),
					ethers.parseUnits('50', 6),
					0,
					deadline,
					sig
				);

			// User 3 transfer
			sig = await signTransfer(
				user3,
				await recipient.getAddress(),
				ethers.parseUnits('25', 6),
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user3.getAddress(),
					await recipient.getAddress(),
					ethers.parseUnits('25', 6),
					0,
					deadline,
					sig
				);

			// Verify all transfers
			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(
				TRANSFER_AMOUNT + ethers.parseUnits('50', 6) + ethers.parseUnits('25', 6)
			);

			// Verify each user's nonce
			expect(await router.nonces(await user.getAddress())).to.equal(1);
			expect(await router.nonces(await user2.getAddress())).to.equal(1);
			expect(await router.nonces(await user3.getAddress())).to.equal(1);
		});

		it('should handle concurrent transfer attempts correctly', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// Sign two transfers with same nonce
			const sig1 = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			// First one should succeed
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					sig1
				);

			// Second one with same nonce should fail
			const sig2 = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						sig2
					)
			).to.be.revertedWithCustomError(router, 'InvalidNonce');
		});
	});

	describe('Contract State Verification', () => {
		it('should correctly report all immutables', async () => {
			expect(await router.USDT()).to.equal(await usdt.getAddress());
			expect(await router.treasury()).to.equal(await treasury.getAddress());
			expect(await router.FIXED_FEE()).to.equal(FIXED_FEE);
			expect(await router.sponsor()).to.equal(await sponsor.getAddress());
		});

		it('should not hold any USDT after transfers', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			// Verify initial balance is 0
			expect(await usdt.balanceOf(await router.getAddress())).to.equal(0);

			// Execute transfer
			const signature = await signTransfer(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					signature
				);

			// Still 0 - contract is non-custodial
			expect(await usdt.balanceOf(await router.getAddress())).to.equal(0);
		});

		it('should maintain correct paused state', async () => {
			expect(await router.isPaused()).to.equal(false);

			await router.connect(owner).pause();
			expect(await router.isPaused()).to.equal(true);

			await router.connect(owner).unpause();
			expect(await router.isPaused()).to.equal(false);
		});

		it('should generate correct domain separator', async () => {
			const separator = await router.DOMAIN_SEPARATOR();
			expect(separator).to.not.equal(ethers.ZeroHash);

			// Verify it's deterministic
			const separator2 = await router.DOMAIN_SEPARATOR();
			expect(separator).to.equal(separator2);
		});
	});
});
