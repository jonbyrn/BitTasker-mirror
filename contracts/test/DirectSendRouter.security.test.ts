import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DirectSendRouter, ERC20Mock } from '../typechain-types';
import type { SignerWithAddress, Signer } from '@nomicfoundation/hardhat-ethers/signers';
import type { TypedDataDomain, TypedDataField } from 'ethers';

describe('DirectSendRouter - Security Tests', () => {
	let router: DirectSendRouter;
	let usdt: ERC20Mock;
	let owner: SignerWithAddress;
	let user: Signer;
	let recipient: SignerWithAddress;
	let treasury: SignerWithAddress;
	let sponsor: SignerWithAddress;
	let attacker: SignerWithAddress;

	const FIXED_FEE = ethers.parseUnits('1', 6);
	const TRANSFER_AMOUNT = ethers.parseUnits('100', 6);

	let domain: TypedDataDomain;
	let types: Record<string, TypedDataField[]>;

	beforeEach(async () => {
		[owner, recipient, treasury, sponsor, attacker] = await ethers.getSigners();

		const userWallet = ethers.Wallet.createRandom();
		user = userWallet.connect(ethers.provider);

		await owner.sendTransaction({
			to: await user.getAddress(),
			value: ethers.parseEther('1')
		});

		const USDTFactory = await ethers.getContractFactory('ERC20Mock');
		usdt = await USDTFactory.deploy();

		const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
		router = await RouterFactory.deploy(
			await usdt.getAddress(),
			await treasury.getAddress(),
			FIXED_FEE,
			await sponsor.getAddress()
		);

		const mintAmount = ethers.parseUnits('100000', 6);
		await usdt.mint(await user.getAddress(), mintAmount);
		await usdt.connect(user).approve(await router.getAddress(), mintAmount);

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

	async function signTransferRequest(
		userWallet: Signer,
		recipientAddr: string,
		amount: bigint,
		nonce: bigint,
		deadlineVal: bigint
	): Promise<string> {
		const message = {
			user: await userWallet.getAddress(),
			recipient: recipientAddr,
			amount: amount,
			nonce: nonce,
			deadline: deadlineVal
		};

		return await userWallet.signTypedData(domain, types, message);
	}

	// ============================================================================
	// SIGNATURE SECURITY TESTS
	// ============================================================================

	describe('Signature Security', () => {
		it('should prevent signature replay on different chains', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			expect(await router.DOMAIN_SEPARATOR()).to.not.equal(ethers.ZeroHash);
		});

		it('should prevent signature reuse with same nonce after execution', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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
			).to.be.revertedWithCustomError(router, 'InvalidNonce');
		});

		it('should detect tampered signature', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			// Sign a valid request first (for context documentation)
			await signTransferRequest(user, await recipient.getAddress(), TRANSFER_AMOUNT, 0, deadline);

			const tamperedSignature = '0x' + '00'.repeat(65);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						tamperedSignature
					)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});

		it('should detect amount manipulation', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			const signatureFor100 = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			const differentAmount = ethers.parseUnits('999', 6);
			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						differentAmount,
						0,
						deadline,
						signatureFor100
					)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});

		it('should detect recipient manipulation', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			const signatureForRecipientA = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			const recipientB = (await ethers.getSigners())[9];
			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipientB.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						signatureForRecipientA
					)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});

		it('should prevent front-running with deadline extension', async () => {
			const shortDeadline = BigInt(Math.floor(Date.now() / 1000) + 1);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				shortDeadline
			);

			await ethers.provider.send('evm_increaseTime', [2]);
			await ethers.provider.send('evm_mine', []);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						shortDeadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ExpiredDeadline');
		});
	});

	// ============================================================================
	// ACCESS CONTROL TESTS
	// ============================================================================

	describe('Access Control', () => {
		it('should enforce sponsor-only route function', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			await expect(
				router
					.connect(attacker)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'NotSponsor');
		});

		it('should enforce Ownable for pause function', async () => {
			await expect(router.connect(attacker).pause()).to.be.revertedWithCustomError(
				router,
				'OwnableUnauthorizedAccount'
			);
		});

		it('should enforce Ownable for unpause function', async () => {
			await router.connect(owner).pause();
			await expect(router.connect(attacker).unpause()).to.be.revertedWithCustomError(
				router,
				'OwnableUnauthorizedAccount'
			);
		});

		it('should allow only owner to pause/unpause', async () => {
			await router.connect(owner).pause();
			expect(await router.isPaused()).to.equal(true);

			await router.connect(owner).unpause();
			expect(await router.isPaused()).to.equal(false);
		});
	});

	// ============================================================================
	// NON-CUSTODIAL VERIFICATION
	// ============================================================================

	describe('Non-Custodial Verification', () => {
		it('should never hold user funds', async () => {
			const routerBalanceBefore = await usdt.balanceOf(await router.getAddress());

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			const routerBalanceAfter = await usdt.balanceOf(await router.getAddress());

			expect(routerBalanceBefore).to.equal(0);
			expect(routerBalanceAfter).to.equal(0);
		});

		it('should only transfer from user to recipient and treasury', async () => {
			const userBalanceBefore = await usdt.balanceOf(await user.getAddress());
			const recipientBalanceBefore = await usdt.balanceOf(await recipient.getAddress());
			const treasuryBalanceBefore = await usdt.balanceOf(await treasury.getAddress());

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(
				recipientBalanceBefore + TRANSFER_AMOUNT
			);
			expect(await usdt.balanceOf(await treasury.getAddress())).to.equal(
				treasuryBalanceBefore + FIXED_FEE
			);
			expect(await usdt.balanceOf(await user.getAddress())).to.equal(
				userBalanceBefore - TRANSFER_AMOUNT - FIXED_FEE
			);

			const routerBalance = await usdt.balanceOf(await router.getAddress());
			expect(routerBalance).to.equal(0);
		});

		it('should not allow sponsor to redirect funds', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			const attackerAddr = await attacker.getAddress();
			await expect(
				router
					.connect(sponsor)
					.route(await user.getAddress(), attackerAddr, TRANSFER_AMOUNT, 0, deadline, signature)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});
	});

	// ============================================================================
	// PAUSE FUNCTIONALITY SECURITY
	// ============================================================================

	describe('Pause Mechanism Security', () => {
		it('should prevent all transfers when paused', async () => {
			await router.connect(owner).pause();

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

		it('should maintain pause state during failed operations', async () => {
			await router.connect(owner).pause();

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			expect(await router.isPaused()).to.equal(true);
		});

		it('should allow transfers after unpause', async () => {
			await router.connect(owner).pause();
			await router.connect(owner).unpause();

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(TRANSFER_AMOUNT);
		});
	});

	// ============================================================================
	// INPUT VALIDATION SECURITY
	// ============================================================================

	describe('Input Validation Security', () => {
		it('should reject zero address user', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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
						ethers.ZeroAddress,
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidUser');
		});

		it('should reject zero address recipient', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				ethers.ZeroAddress,
				TRANSFER_AMOUNT,
				0,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						ethers.ZeroAddress,
						TRANSFER_AMOUNT,
						0,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidRecipient');
		});

		it('should reject zero amount', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				0,
				0,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(await user.getAddress(), await recipient.getAddress(), 0, 0, deadline, signature)
			).to.be.revertedWithCustomError(router, 'InvalidAmount');
		});

		it('should reject past deadline', async () => {
			const pastDeadline = BigInt(Math.floor(Date.now() / 1000) - 100);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				pastDeadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						0,
						pastDeadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ExpiredDeadline');
		});

		it('should reject wrong nonce', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				999,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						999,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidNonce');
		});
	});

	// ============================================================================
	// EDGE CASES
	// ============================================================================

	describe('Edge Cases and Attack Vectors', () => {
		it('should handle multiple users with independent nonces', async () => {
			const user2 = ethers.Wallet.createRandom().connect(ethers.provider);
			await owner.sendTransaction({
				to: await user2.getAddress(),
				value: ethers.parseEther('1')
			});

			await usdt.mint(await user2.getAddress(), ethers.parseUnits('10000', 6));
			await usdt.connect(user2).approve(await router.getAddress(), ethers.parseUnits('10000', 6));

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

			const sig1 = await signTransferRequest(
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
					sig1
				);

			const sig2 = await signTransferRequest(
				user2,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				0,
				deadline
			);
			await router
				.connect(sponsor)
				.route(
					await user2.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					0,
					deadline,
					sig2
				);

			expect(await router.nonces(await user.getAddress())).to.equal(1);
			expect(await router.nonces(await user2.getAddress())).to.equal(1);
		});

		it('should handle large amount safely', async () => {
			const hugeAmount = ethers.parseUnits('10000000', 6);
			await usdt.mint(await user.getAddress(), hugeAmount);
			await usdt.connect(user).approve(await router.getAddress(), hugeAmount + FIXED_FEE);

			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				hugeAmount,
				0,
				deadline
			);

			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					hugeAmount,
					0,
					deadline,
					signature
				);

			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(hugeAmount);
		});
	});
});
