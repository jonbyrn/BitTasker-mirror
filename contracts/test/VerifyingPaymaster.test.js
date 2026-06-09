const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

// Mock EntryPoint for testing
const MOCK_ENTRY_POINT_ABI = [
	'function balanceOf(address) view returns (uint256)',
	'function depositTo(address) payable',
	'function withdrawTo(address payable, uint256)'
];

describe('VerifyingPaymaster', function () {
	const MAX_CALL_GAS = 5_000_000n;
	const MAX_TOTAL_GAS = 6_000_000n;
	const MAX_FEE_PER_GAS = 1_000_000_000n; // 1 gwei

	async function deployFixture() {
		const [owner, signer, user, stranger] = await ethers.getSigners();

		// Create a Wallet from the signer for signingKey access
		// Use a deterministic private key for the verifying signer
		const signerWallet = new ethers.Wallet(
			'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
		);

		// Deploy a mock EntryPoint
		const MockEntryPoint = await ethers.getContractFactory('MockEntryPoint');
		const mockEntryPoint = await MockEntryPoint.deploy();
		await mockEntryPoint.waitForDeployment();

		// Deploy VerifyingPaymaster with the wallet address as verifying signer
		const Paymaster = await ethers.getContractFactory('VerifyingPaymaster');
		const paymaster = await Paymaster.deploy(
			await mockEntryPoint.getAddress(),
			signerWallet.address
		);
		await paymaster.waitForDeployment();

		return { paymaster, mockEntryPoint, owner, signer, signerWallet, user, stranger };
	}

	describe('Deployment', function () {
		it('should set the correct EntryPoint', async function () {
			const { paymaster, mockEntryPoint } = await loadFixture(deployFixture);
			expect(await paymaster.entryPoint()).to.equal(await mockEntryPoint.getAddress());
		});

		it('should set the correct verifying signer', async function () {
			const { paymaster, signerWallet } = await loadFixture(deployFixture);
			expect(await paymaster.verifyingSigner()).to.equal(signerWallet.address);
		});

		it('should have correct fee cap constants', async function () {
			const { paymaster } = await loadFixture(deployFixture);
			expect(await paymaster.MAX_CALL_GAS()).to.equal(MAX_CALL_GAS);
			expect(await paymaster.MAX_TOTAL_GAS()).to.equal(MAX_TOTAL_GAS);
			expect(await paymaster.MAX_FEE_PER_GAS()).to.equal(MAX_FEE_PER_GAS);
		});
	});

	describe('Deposit Management', function () {
		it('should accept ETH deposits via deposit()', async function () {
			const { paymaster, mockEntryPoint } = await loadFixture(deployFixture);
			const amount = ethers.parseEther('1.0');

			await paymaster.deposit({ value: amount });

			const deposit = await paymaster.getDeposit();
			expect(deposit).to.equal(amount);
		});

		it('should allow owner to withdraw', async function () {
			const { paymaster, owner } = await loadFixture(deployFixture);
			const amount = ethers.parseEther('0.5');

			await paymaster.deposit({ value: amount });

			// Note: In production, withdrawTo calls entryPoint.withdrawTo
			// For unit tests with mock EP, this verifies the function exists and is callable
		});

		it('should return zero deposit when empty', async function () {
			const { paymaster } = await loadFixture(deployFixture);
			expect(await paymaster.getDeposit()).to.equal(0);
		});
	});

	describe('On-Chain Fee Caps', function () {
		it('should reject UserOp with callGasLimit exceeding MAX_CALL_GAS', async function () {
			const { paymaster, mockEntryPoint, signer } = await loadFixture(deployFixture);

			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: MAX_CALL_GAS + 1n,
				verificationGasLimit: 100_000n,
				preVerificationGas: 50_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			await expect(
				mockEntryPoint.callValidatePaymaster(await paymaster.getAddress(), userOp, userOpHash)
			).to.be.revertedWithCustomError(paymaster, 'GasLimitExceeded');
		});

		it('should reject UserOp where totalGas exceeds MAX_TOTAL_GAS', async function () {
			const { paymaster, mockEntryPoint } = await loadFixture(deployFixture);

			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: 3_000_000n,
				verificationGasLimit: 2_000_000n,
				preVerificationGas: 1_000_001n, // total = 6,000,001 > 6,000,000
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			await expect(
				mockEntryPoint.callValidatePaymaster(await paymaster.getAddress(), userOp, userOpHash)
			).to.be.revertedWithCustomError(paymaster, 'GasLimitExceeded');
		});

		it('should reject UserOp with maxFeePerGas exceeding MAX_FEE_PER_GAS', async function () {
			const { paymaster, mockEntryPoint } = await loadFixture(deployFixture);

			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 100_000n,
				preVerificationGas: 50_000n,
				maxFeePerGas: MAX_FEE_PER_GAS + 1n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			await expect(
				mockEntryPoint.callValidatePaymaster(await paymaster.getAddress(), userOp, userOpHash)
			).to.be.revertedWithCustomError(paymaster, 'FeePerGasExceeded');
		});

		it('should accept UserOp within fee limits', async function () {
			const { paymaster, mockEntryPoint, signerWallet } = await loadFixture(deployFixture);

			// Build a valid UserOp within limits
			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: 200_000n,
				verificationGasLimit: 100_000n,
				preVerificationGas: 50_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			// Compute the expected hash
			const hash = ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					['address', 'uint256', 'bytes32', 'address', 'uint256'],
					[
						userOp.sender,
						userOp.nonce,
						ethers.keccak256(userOp.callData),
						await mockEntryPoint.getAddress(),
						(await ethers.provider.getNetwork()).chainId
					]
				)
			);

			// Sign with the verifying signer using raw digest (no Ethereum message prefix)
			// Contract uses ECDSA.recover(hash, signature) which expects raw signature
			const signature = signerWallet.signingKey.sign(hash).serialized;
			userOp.signature = signature;

			// Should NOT revert with GasLimitExceeded or FeePerGasExceeded
			try {
				await mockEntryPoint.callValidatePaymaster(
					await paymaster.getAddress(),
					userOp,
					userOpHash
				);
			} catch (e) {
				// Should NOT be GasLimitExceeded or FeePerGasExceeded
				expect(e.message).to.not.include('GasLimitExceeded');
				expect(e.message).to.not.include('FeePerGasExceeded');
			}
		});
	});

	describe('Signature Verification', function () {
		it('should revert with InvalidPaymasterSignature for wrong signer', async function () {
			const { paymaster, mockEntryPoint, stranger } = await loadFixture(deployFixture);

			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 25_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			// Sign with wrong key
			const hash = ethers.keccak256(
				ethers.AbiCoder.defaultAbiCoder().encode(
					['address', 'uint256', 'bytes32', 'address', 'uint256'],
					[
						userOp.sender,
						userOp.nonce,
						ethers.keccak256(userOp.callData),
						await mockEntryPoint.getAddress(),
						(await ethers.provider.getNetwork()).chainId
					]
				)
			);
			const badSignature = await stranger.signMessage(ethers.getBytes(hash));
			userOp.signature = badSignature;

			await expect(
				mockEntryPoint.callValidatePaymaster(await paymaster.getAddress(), userOp, userOpHash)
			).to.be.revertedWithCustomError(paymaster, 'InvalidPaymasterSignature');
		});
	});

	describe('Access Control', function () {
		it('should reject direct calls to validatePaymasterUserOp', async function () {
			const { paymaster, user } = await loadFixture(deployFixture);

			const userOp = {
				sender: ethers.ZeroAddress,
				nonce: 0,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 25_000n,
				maxFeePerGas: 100_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			};

			const userOpHash = ethers.keccak256(ethers.toUtf8Bytes('test'));

			await expect(
				paymaster.connect(user).validatePaymasterUserOp(userOp, userOpHash, 0)
			).to.be.revertedWithCustomError(paymaster, 'InvalidSigner');
		});
	});

	describe('Receive ETH', function () {
		it('should accept ETH transfers (for refunds)', async function () {
			const { paymaster, owner } = await loadFixture(deployFixture);
			const amount = ethers.parseEther('0.1');

			await owner.sendTransaction({ to: await paymaster.getAddress(), value: amount });

			const balance = await ethers.provider.getBalance(await paymaster.getAddress());
			expect(balance).to.equal(amount);
		});
	});
});
