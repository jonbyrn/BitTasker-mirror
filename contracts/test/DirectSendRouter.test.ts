import { expect } from 'chai';
import { ethers } from 'hardhat';
import { DirectSendRouter, ERC20Mock } from '../typechain-types';
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import type { TypedDataDomain, TypedDataField, Signer } from 'ethers';

describe('DirectSendRouter - Meta-Transaction Tests', () => {
	let router: DirectSendRouter;
	let usdt: ERC20Mock;
	let owner: SignerWithAddress;
	let user: Signer;
	let recipient: SignerWithAddress;
	let treasury: SignerWithAddress;
	let sponsor: SignerWithAddress;
	let attacker: SignerWithAddress;

	const FIXED_FEE = ethers.parseUnits('1', 6); // 1 USDT = $0.01
	const TRANSFER_AMOUNT = ethers.parseUnits('100', 6); // 100 USDT

	// EIP-712 domain
	let domain: TypedDataDomain;
	let types: Record<string, TypedDataField[]>;

	async function signTransferRequest(
		userWallet: Signer,
		recipientAddr: string,
		amount: bigint,
		nonce: bigint | number,
		deadlineVal: bigint
	): Promise<string> {
		const message = {
			user: await userWallet.getAddress(),
			recipient: recipientAddr,
			amount: amount,
			nonce: BigInt(nonce),
			deadline: deadlineVal
		};

		return await userWallet.signTypedData(domain, types, message);
	}

	beforeEach(async () => {
		[owner, recipient, treasury, sponsor, attacker] = await ethers.getSigners();

		// Create a random wallet for user
		const userWallet = ethers.Wallet.createRandom();
		// Connect to provider
		user = userWallet.connect(ethers.provider);

		// Send some ETH to user for gas (even though they won't pay gas)
		await owner.sendTransaction({
			to: await user.getAddress(),
			value: ethers.parseEther('1')
		});

		// Deploy mock USDT
		const USDTFactory = await ethers.getContractFactory('ERC20Mock');
		usdt = await USDTFactory.deploy();

		// Deploy DirectSendRouter
		const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
		router = await RouterFactory.deploy(
			await usdt.getAddress(),
			await treasury.getAddress(),
			FIXED_FEE,
			await sponsor.getAddress()
		);

		// Mint USDT to user
		const mintAmount = ethers.parseUnits('10000', 6);
		await usdt.mint(await user.getAddress(), mintAmount);

		// Approve router to spend user's USDT
		await usdt.connect(user).approve(await router.getAddress(), ethers.parseUnits('10000', 6));

		// Setup EIP-712 domain for signing
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

	describe('Deployment', () => {
		it('should set correct initial state', async () => {
			expect(await router.USDT()).to.equal(await usdt.getAddress());
			expect(await router.treasury()).to.equal(await treasury.getAddress());
			expect(await router.FIXED_FEE()).to.equal(FIXED_FEE);
			expect(await router.sponsor()).to.equal(await sponsor.getAddress());
			expect(await router.isPaused()).to.equal(false);
		});

		it('should not allow invalid USDT address', async () => {
			const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
			await expect(
				RouterFactory.deploy(
					ethers.ZeroAddress,
					await treasury.getAddress(),
					FIXED_FEE,
					await sponsor.getAddress()
				)
			).to.be.revertedWith('Invalid USDT address');
		});

		it('should not allow invalid treasury address', async () => {
			const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
			await expect(
				RouterFactory.deploy(
					await usdt.getAddress(),
					ethers.ZeroAddress,
					FIXED_FEE,
					await sponsor.getAddress()
				)
			).to.be.revertedWith('Invalid treasury address');
		});

		it('should not allow invalid sponsor address', async () => {
			const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
			await expect(
				RouterFactory.deploy(
					await usdt.getAddress(),
					await treasury.getAddress(),
					FIXED_FEE,
					ethers.ZeroAddress
				)
			).to.be.revertedWith('Invalid sponsor address');
		});

		it('should not allow zero fee', async () => {
			const RouterFactory = await ethers.getContractFactory('DirectSendRouter');
			await expect(
				RouterFactory.deploy(
					await usdt.getAddress(),
					await treasury.getAddress(),
					0,
					await sponsor.getAddress()
				)
			).to.be.revertedWith('Fee must be positive');
		});

		it('should set correct domain separator', async () => {
			const domainSeparator = await router.DOMAIN_SEPARATOR();
			expect(domainSeparator).to.not.equal(ethers.ZeroHash);
		});
	});

	describe('Meta-Transaction Route Function', () => {
		let deadline: bigint;

		beforeEach(async () => {
			deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
		});

		it('should transfer USDT and collect fee', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

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

			await tx.wait();

			// Verify recipient received amount
			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(TRANSFER_AMOUNT);

			// Verify treasury received fee
			expect(await usdt.balanceOf(await treasury.getAddress())).to.equal(FIXED_FEE);

			// Verify user balance decreased
			const userBalance = await usdt.balanceOf(await user.getAddress());
			expect(userBalance).to.equal(ethers.parseUnits('10000', 6) - TRANSFER_AMOUNT - FIXED_FEE);
		});

		it('should emit Transfer event with correct parameters', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			)
				.to.emit(router, 'Transfer')
				.withArgs(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					FIXED_FEE
				);
		});

		it("should increment user's nonce after successful transfer", async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			expect(await router.nonces(await user.getAddress())).to.equal(1);
		});

		it('should reject if caller is not sponsor', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await expect(
				router
					.connect(attacker)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'NotSponsor');
		});

		it('should reject if signature is invalid', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			// Tamper with signature - change last character
			const tamperedSignature =
				signature.slice(0, -2) + (signature.slice(-2) === '00' ? '01' : '00');

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						tamperedSignature
					)
			).to.be.revertedWithCustomError(router, 'InvalidSignature');
		});

		it('should reject if deadline expired', async () => {
			const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 100); // Past
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				expiredDeadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						expiredDeadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ExpiredDeadline');
		});

		it('should reject if nonce is wrong', async () => {
			const wrongNonce = 5; // User's actual nonce is 0
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				wrongNonce,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						wrongNonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidNonce');
		});

		it('should reject if recipient is zero address', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				ethers.ZeroAddress,
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						ethers.ZeroAddress,
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidRecipient');
		});

		it('should reject if amount is zero', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				0,
				nonce,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						0,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidAmount');
		});

		it('should reject if balance insufficient', async () => {
			const poorUser = ethers.Wallet.createRandom().connect(ethers.provider);

			// Give poorUser some ETH for the approve transaction
			await owner.sendTransaction({
				to: await poorUser.getAddress(),
				value: ethers.parseEther('1')
			});

			await usdt.mint(await poorUser.getAddress(), FIXED_FEE); // Only fee, no amount
			await usdt.connect(poorUser).approve(await router.getAddress(), ethers.parseUnits('10', 6));

			const nonce = 0;
			const signature = await signTransferRequest(
				poorUser,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await expect(
				router
					.connect(sponsor)
					.route(
						await poorUser.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InsufficientBalance');
		});

		it('should handle multiple transfers with incrementing nonces', async () => {
			// First transfer
			let nonce = 0;
			let signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			// Second transfer
			nonce = 1;
			signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			expect(await router.nonces(await user.getAddress())).to.equal(2);
			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(TRANSFER_AMOUNT * 2n);
			expect(await usdt.balanceOf(await treasury.getAddress())).to.equal(FIXED_FEE * 2n);
		});

		it('should reject replay of same signature (nonce already used)', async () => {
			const nonce = 0;
			const signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);

			// First execution should succeed
			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			// Second execution with same nonce should fail
			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'InvalidNonce');
		});
	});

	describe('Pause/Unpause', () => {
		let deadline: bigint;
		let nonce: number;
		let signature: string;

		beforeEach(async () => {
			deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			nonce = 0;
			signature = await signTransferRequest(
				user,
				await recipient.getAddress(),
				TRANSFER_AMOUNT,
				nonce,
				deadline
			);
		});

		it('should allow owner to pause', async () => {
			await router.connect(owner).pause();
			expect(await router.isPaused()).to.equal(true);
		});

		it('should allow owner to unpause', async () => {
			await router.connect(owner).pause();
			await router.connect(owner).unpause();
			expect(await router.isPaused()).to.equal(false);
		});

		it('should block transfers when paused', async () => {
			await router.connect(owner).pause();

			await expect(
				router
					.connect(sponsor)
					.route(
						await user.getAddress(),
						await recipient.getAddress(),
						TRANSFER_AMOUNT,
						nonce,
						deadline,
						signature
					)
			).to.be.revertedWithCustomError(router, 'ContractPaused');
		});

		it('should allow transfers after unpause', async () => {
			await router.connect(owner).pause();
			await router.connect(owner).unpause();

			await router
				.connect(sponsor)
				.route(
					await user.getAddress(),
					await recipient.getAddress(),
					TRANSFER_AMOUNT,
					nonce,
					deadline,
					signature
				);

			expect(await usdt.balanceOf(await recipient.getAddress())).to.equal(TRANSFER_AMOUNT);
		});

		it('should not allow non-owner to pause', async () => {
			await expect(router.connect(attacker).pause()).to.be.revertedWithCustomError(
				router,
				'OwnableUnauthorizedAccount'
			);
		});

		it('should not allow non-owner to unpause', async () => {
			await router.connect(owner).pause();
			await expect(router.connect(attacker).unpause()).to.be.revertedWithCustomError(
				router,
				'OwnableUnauthorizedAccount'
			);
		});
	});

	describe('View Functions', () => {
		it('should return correct domain separator', async () => {
			const separator = await router.getDomainSeparator();
			expect(separator).to.not.equal(ethers.ZeroHash);
		});

		it('should return correct nonce for user', async () => {
			expect(await router.getNonce(await user.getAddress())).to.equal(0);

			// After a transfer, nonce should be incremented
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

			expect(await router.getNonce(await user.getAddress())).to.equal(1);
		});

		it('should return correct treasury address', async () => {
			expect(await router.treasury()).to.equal(await treasury.getAddress());
		});

		it('should return correct sponsor address', async () => {
			expect(await router.sponsor()).to.equal(await sponsor.getAddress());
		});

		it('should return correct fixed fee', async () => {
			expect(await router.FIXED_FEE()).to.equal(FIXED_FEE);
		});
	});

	describe('Gas Efficiency', () => {
		it('should use less than 150k gas for route', async () => {
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
			const signature = await signTransferRequest(
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

			console.log(`Gas used: ${gasUsed}`);
			expect(gasUsed).to.be.lessThan(150000n);
		});
	});
});
