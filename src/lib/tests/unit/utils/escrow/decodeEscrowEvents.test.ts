/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
	decodeBscEscrowEvent,
	decodeBscEscrowEvents,
	filterEscrowEventsByType,
	filterEscrowEventsByEscrowId
} from '$lib/utils/escrow/v1/decodeEscrowEvents';
import { ethers, type Log } from 'ethers';

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

describe('decodeEscrowEvents', () => {
	const mockLog: Log = {
		address: '0x1234567890123456789012345678901234567890',
		blockNumber: 12345,
		blockHash: '0x' + 'a'.repeat(64),
		transactionIndex: 0,
		removed: false,
		topics: ['0x' + 'b'.repeat(64)],
		data: '0x' + 'c'.repeat(128),
		transactionHash: '0x' + 'd'.repeat(64)
	};

	describe('decodeBscEscrowEvent', () => {
		it('should decode CREATED event successfully', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1),
					client: '0x' + '1'.repeat(40),
					freelancer: '0x' + '2'.repeat(40),
					amount: BigInt('100500000')
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).not.toBeNull();
			expect(decoded?.type).toBe('CREATED');
			expect(decoded?.escrowId).toBe('1');
			expect(decoded?.amountUSDT).toContain('100.5');
			expect(decoded?.blockNumber).toBe(12345);
			expect(decoded?.transactionHash).toBe(mockLog.transactionHash);
		});

		it('should decode COMPLETED event successfully', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'TaskCompleted',
					inputs: [{ name: 'escrowId', type: 'uint256', indexed: true }]
				}
			]);

			const mockParsedLog = {
				name: 'TaskCompleted',
				signature: 'TaskCompleted(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1)
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).not.toBeNull();
			expect(decoded?.type).toBe('COMPLETED');
			expect(decoded?.escrowId).toBe('1');
			expect(decoded?.status).toBe('COMPLETED');
		});

		it('should decode DISPUTED event successfully', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'TaskDisputed',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'disputer', type: 'address', indexed: true }
					]
				}
			]);

			const mockParsedLog = {
				name: 'TaskDisputed',
				signature: 'TaskDisputed(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(2),
					disputer: '0x' + '3'.repeat(40)
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).not.toBeNull();
			expect(decoded?.type).toBe('DISPUTED');
			expect(decoded?.escrowId).toBe('2');
			expect(decoded?.senderAddress).toBe('0x' + '3'.repeat(40));
		});

		it('should preserve USDT amount precision (6 decimals)', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1),
					client: '0x' + '1'.repeat(40),
					freelancer: '0x' + '2'.repeat(40),
					amount: BigInt('100123456') // 100.123456 USDT
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded?.amountUSDT).toBe('100.123456');
		});

		it('should handle missing required fields gracefully', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					// Missing required fields
					client: '0x' + '1'.repeat(40)
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).toBeNull();
		});

		it('should return null for unknown event types', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'UnknownEvent',
					inputs: [{ name: 'id', type: 'uint256', indexed: true }]
				}
			]);

			const mockParsedLog = {
				name: 'UnknownEvent',
				signature: 'UnknownEvent(...)',
				topic: '0x' + 'b'.repeat(64),
				args: { id: BigInt(1) }
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).toBeNull();
		});

		it('should return null if log does not match ABI', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [{ name: 'escrowId', type: 'uint256' }]
				}
			]);

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(null);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).toBeNull();
		});

		it('should handle decoding errors and return null', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [{ name: 'escrowId', type: 'uint256' }]
				}
			]);

			vi.spyOn(mockAbi, 'parseLog').mockImplementation(() => {
				throw new Error('Decoding failed');
			});

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).toBeNull();
		});

		it('should handle string ABI input', () => {
			const abiString = JSON.stringify([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1),
					client: '0x' + '1'.repeat(40),
					freelancer: '0x' + '2'.repeat(40),
					amount: BigInt('100500000')
				}
			};

			const mockAbi = new ethers.Interface(abiString);
			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

			expect(decoded).not.toBeNull();
			expect(decoded?.type).toBe('CREATED');
		});
	});

	describe('decodeBscEscrowEvents', () => {
		it('should batch decode multiple logs', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const logs: Log[] = [mockLog, mockLog];

			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1),
					client: '0x' + '1'.repeat(40),
					freelancer: '0x' + '2'.repeat(40),
					amount: BigInt('100500000')
				}
			};

			vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

			const decoded = decodeBscEscrowEvents(logs, mockAbi);

			expect(decoded).toHaveLength(2);
			expect(decoded[0].type).toBe('CREATED');
			expect(decoded[1].type).toBe('CREATED');
		});

		it('should skip logs that fail to decode', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [{ name: 'escrowId', type: 'uint256' }]
				}
			]);

			const logs: Log[] = [mockLog, mockLog];

			// First log fails, second succeeds
			const mockParsedLog = {
				name: 'EscrowCreated',
				signature: 'EscrowCreated(...)',
				topic: '0x' + 'b'.repeat(64),
				args: {
					escrowId: BigInt(1),
					client: '0x' + '1'.repeat(40),
					freelancer: '0x' + '2'.repeat(40),
					amount: BigInt('100500000')
				}
			};

			let callCount = 0;
			vi.spyOn(mockAbi, 'parseLog').mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return null; // First call fails
				}
				return mockParsedLog as any;
			});

			const decoded = decodeBscEscrowEvents(logs, mockAbi);

			expect(decoded).toHaveLength(1);
		});
	});

	describe('filterEscrowEventsByType', () => {
		it('should filter events by type', () => {
			const events = [
				{
					type: 'CREATED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 1,
					transactionHash: ''
				},
				{
					type: 'COMPLETED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'COMPLETED',
					timestamp: 0,
					blockNumber: 2,
					transactionHash: ''
				},
				{
					type: 'CREATED' as const,
					escrowId: '2',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '50',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 3,
					transactionHash: ''
				}
			];

			const created = filterEscrowEventsByType(events, 'CREATED');

			expect(created).toHaveLength(2);
			expect(created.every((e) => e.type === 'CREATED')).toBe(true);
		});

		it('should return empty array if no matches', () => {
			const events = [
				{
					type: 'CREATED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 1,
					transactionHash: ''
				}
			];

			const completed = filterEscrowEventsByType(events, 'COMPLETED');

			expect(completed).toHaveLength(0);
		});
	});

	describe('filterEscrowEventsByEscrowId', () => {
		it('should filter events by escrow ID', () => {
			const events = [
				{
					type: 'CREATED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 1,
					transactionHash: ''
				},
				{
					type: 'COMPLETED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'COMPLETED',
					timestamp: 0,
					blockNumber: 2,
					transactionHash: ''
				},
				{
					type: 'CREATED' as const,
					escrowId: '2',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '50',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 3,
					transactionHash: ''
				}
			];

			const escrow1Events = filterEscrowEventsByEscrowId(events, '1');

			expect(escrow1Events).toHaveLength(2);
			expect(escrow1Events.every((e) => e.escrowId === '1')).toBe(true);
		});

		it('should return empty array if escrow ID not found', () => {
			const events = [
				{
					type: 'CREATED' as const,
					escrowId: '1',
					senderAddress: '',
					recipientAddress: '',
					amountUSDT: '100',
					status: 'CREATED',
					timestamp: 0,
					blockNumber: 1,
					transactionHash: ''
				}
			];

			const escrow999Events = filterEscrowEventsByEscrowId(events, '999');

			expect(escrow999Events).toHaveLength(0);
		});
	});

	describe('amount precision', () => {
		it('should format amounts with exactly 6 decimals', () => {
			const mockAbi = new ethers.Interface([
				{
					type: 'event',
					name: 'EscrowCreated',
					inputs: [
						{ name: 'escrowId', type: 'uint256', indexed: true },
						{ name: 'client', type: 'address', indexed: true },
						{ name: 'freelancer', type: 'address', indexed: true },
						{ name: 'amount', type: 'uint256', indexed: false }
					]
				}
			]);

			const testCases = [
				{ input: BigInt('1'), expected: '0.000001' },
				{ input: BigInt('500000'), expected: '0.5' },
				{ input: BigInt('100500000'), expected: '100.5' },
				{ input: BigInt('123456789'), expected: '123.456789' }
			];

			for (const testCase of testCases) {
				const mockParsedLog = {
					name: 'EscrowCreated',
					signature: 'EscrowCreated(...)',
					topic: '0x' + 'b'.repeat(64),
					args: {
						escrowId: BigInt(1),
						client: '0x' + '1'.repeat(40),
						freelancer: '0x' + '2'.repeat(40),
						amount: testCase.input
					}
				};

				vi.spyOn(mockAbi, 'parseLog').mockReturnValue(mockParsedLog as any);

				const decoded = decodeBscEscrowEvent(mockLog, mockAbi);

				expect(decoded?.amountUSDT).toContain(testCase.expected);
			}
		});
	});
});
