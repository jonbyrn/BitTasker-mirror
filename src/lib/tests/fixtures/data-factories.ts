/**
 * Test Data Factory Functions
 *
 * Provides clean, reusable factory functions for generating
 * test objects with sensible defaults
 */

export interface BscPaymentTransaction {
	hash: string;
	from: string;
	to: string;
	value: string; // Atomic units (6 decimals for USDT)
	network: 'usdt-bsc' | 'bsc';
	chainId: 97 | 56;
	type: 'send' | 'receive';
	status: 'pending' | 'confirming' | 'confirmed' | 'failed';
	timestamp: number;
	gasUsed?: string;
	gasPrice?: string;
	nonce?: number;
}

export interface Task {
	id: string;
	title: string;
	description: string;
	budget: number;
	currency: 'USDT' | 'BNB' | 'rBTC';
	network: 'usdt-bsc' | 'bsc' | 'rootstock' | 'rsk';
	creator: string;
	status: 'open' | 'in-progress' | 'completed' | 'cancelled';
	createdAt: number;
	deadline?: number;
	tags?: string[];
}

export interface Bid {
	id: string;
	taskId: string;
	bidder: string;
	amount: number;
	currency: 'USDT' | 'BNB' | 'rBTC';
	message: string;
	status: 'pending' | 'accepted' | 'rejected';
	createdAt: number;
}

export interface EscrowContract {
	id: string;
	taskId: string;
	bidId: string;
	creator: string;
	worker: string;
	amount: string; // Atomic units
	currency: 'USDT' | 'BNB' | 'rBTC';
	network: 'usdt-bsc' | 'bsc' | 'rootstock' | 'rsk';
	status: 'funded' | 'in-progress' | 'completed' | 'disputed' | 'released';
	createdAt: number;
	completedAt?: number;
	transactionHash: string;
	contractAddress: string;
}

export interface User {
	address: string;
	name?: string;
	avatar?: string;
	reputation: number;
	tasksCompleted: number;
	bidAssets?: string[];
}

// ===== BSC Payment Transaction Factories =====

export function createBscTransaction(overrides: Partial<BscPaymentTransaction> = {}): BscPaymentTransaction {
	const defaultTimestamp = Math.floor(Date.now() / 1000);

	return {
		hash: '0x' + Array(64).fill('a').join(''),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
		value: '12345678', // 12.345678 USDT
		network: 'usdt-bsc',
		chainId: 97,
		type: 'send',
		status: 'confirmed',
		timestamp: defaultTimestamp,
		gasUsed: '50000',
		gasPrice: '5000000000',
		nonce: 1,
		...overrides
	};
}

export function createBscTransactions(count: number): BscPaymentTransaction[] {
	return Array.from({ length: count }, (_, i) =>
		createBscTransaction({
			hash: '0x' + i.toString().padStart(64, 'a'),
			timestamp: Math.floor(Date.now() / 1000) - i * 3600,
			type: i % 2 === 0 ? 'send' : 'receive'
		})
	);
}

// ===== Task Factories =====

export function createTask(overrides: Partial<Task> = {}): Task {
	const now = Math.floor(Date.now() / 1000);

	return {
		id: 'task-' + Math.random().toString(36).substr(2, 9),
		title: 'Sample Task',
		description: 'This is a sample task for testing',
		budget: 100,
		currency: 'USDT',
		network: 'usdt-bsc',
		creator: '0x1234567890123456789012345678901234567890',
		status: 'open',
		createdAt: now,
		deadline: now + 7 * 24 * 60 * 60,
		tags: ['design', 'urgent'],
		...overrides
	};
}

export function createTasks(count: number): Task[] {
	return Array.from({ length: count }, (_, i) =>
		createTask({
			id: `task-${i}`,
			title: `Task ${i + 1}`,
			budget: 50 + i * 10,
			createdAt: Math.floor(Date.now() / 1000) - i * 86400
		})
	);
}

// ===== Bid Factories =====

export function createBid(overrides: Partial<Bid> = {}): Bid {
	const now = Math.floor(Date.now() / 1000);

	return {
		id: 'bid-' + Math.random().toString(36).substr(2, 9),
		taskId: 'task-1',
		bidder: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
		amount: 100,
		currency: 'USDT',
		message: 'I can complete this task',
		status: 'pending',
		createdAt: now,
		...overrides
	};
}

export function createBids(count: number, taskId: string = 'task-1'): Bid[] {
	return Array.from({ length: count }, (_, i) =>
		createBid({
			id: `bid-${i}`,
			taskId,
			amount: 80 + i * 5,
			bidder: `0xBid${i.toString().padStart(38, '0')}`,
			createdAt: Math.floor(Date.now() / 1000) - i * 3600
		})
	);
}

// ===== Escrow Contract Factories =====

export function createEscrowContract(overrides: Partial<EscrowContract> = {}): EscrowContract {
	const now = Math.floor(Date.now() / 1000);

	return {
		id: 'escrow-' + Math.random().toString(36).substr(2, 9),
		taskId: 'task-1',
		bidId: 'bid-1',
		creator: '0x1234567890123456789012345678901234567890',
		worker: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
		amount: '100000000', // 100 USDT in atomic units (6 decimals)
		currency: 'USDT',
		network: 'usdt-bsc',
		status: 'funded',
		createdAt: now,
		transactionHash: '0x' + Array(64).fill('b').join(''),
		contractAddress: '0x' + Array(40).fill('c').join(''),
		...overrides
	};
}

export function createEscrowContracts(count: number): EscrowContract[] {
	return Array.from({ length: count }, (_, i) =>
		createEscrowContract({
			id: `escrow-${i}`,
			taskId: `task-${i}`,
			bidId: `bid-${i}`,
			amount: (100 + i * 10).toString() + '000000', // n USDT
			transactionHash: '0x' + i.toString().padStart(64, 'c'),
			createdAt: Math.floor(Date.now() / 1000) - i * 86400
		})
	);
}

// ===== User Factories =====

export function createUser(overrides: Partial<User> = {}): User {
	return {
		address: '0x' + Math.random().toString(16).substr(2, 40),
		name: 'Test User',
		reputation: 100,
		tasksCompleted: 10,
		bidAssets: ['USDT', 'BNB', 'rBTC'],
		...overrides
	};
}

export function createUsers(count: number): User[] {
	return Array.from({ length: count }, (_, i) =>
		createUser({
			address: '0x' + i.toString().padStart(40, 'a'),
			name: `User ${i + 1}`,
			reputation: 50 + i * 10,
			tasksCompleted: i + 1
		})
	);
}

// ===== Builder Pattern for Complex Objects =====

export class BscTransactionBuilder {
	private data: BscPaymentTransaction;

	constructor(template: Partial<BscPaymentTransaction> = {}) {
		this.data = createBscTransaction(template);
	}

	withHash(hash: string): this {
		this.data.hash = hash;
		return this;
	}

	withFrom(address: string): this {
		this.data.from = address;
		return this;
	}

	withTo(address: string): this {
		this.data.to = address;
		return this;
	}

	withValue(value: string): this {
		this.data.value = value;
		return this;
	}

	withStatus(status: BscPaymentTransaction['status']): this {
		this.data.status = status;
		return this;
	}

	withType(type: BscPaymentTransaction['type']): this {
		this.data.type = type;
		return this;
	}

	build(): BscPaymentTransaction {
		return this.data;
	}
}

export class TaskBuilder {
	private data: Task;

	constructor(template: Partial<Task> = {}) {
		this.data = createTask(template);
	}

	withTitle(title: string): this {
		this.data.title = title;
		return this;
	}

	withDescription(description: string): this {
		this.data.description = description;
		return this;
	}

	withBudget(budget: number): this {
		this.data.budget = budget;
		return this;
	}

	withNetwork(network: string): this {
		this.data.network = network as any;
		return this;
	}

	withStatus(status: Task['status']): this {
		this.data.status = status;
		return this;
	}

	build(): Task {
		return this.data;
	}
}

export class EscrowContractBuilder {
	private data: EscrowContract;

	constructor(template: Partial<EscrowContract> = {}) {
		this.data = createEscrowContract(template);
	}

	withAmount(amount: string): this {
		this.data.amount = amount;
		return this;
	}

	withStatus(status: EscrowContract['status']): this {
		this.data.status = status;
		return this;
	}

	withNetwork(network: string): this {
		this.data.network = network as any;
		return this;
	}

	build(): EscrowContract {
		return this.data;
	}
}

// ===== Mock Data Collections =====

export function createMockBscTransactionHistory(count: number = 10): BscPaymentTransaction[] {
	return createBscTransactions(count);
}

export function createMockTaskBoard(count: number = 5): Task[] {
	return createTasks(count);
}

export function createMockBidList(taskId: string, count: number = 3): Bid[] {
	return createBids(count, taskId);
}

export function createMockEscrowContracts(count: number = 3): EscrowContract[] {
	return createEscrowContracts(count);
}

// ===== Validation Helpers =====

export function isValidBscAddress(address: string): boolean {
	return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export function isValidBscTransactionHash(hash: string): boolean {
	return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

export function isValidBscAmount(value: string): boolean {
	try {
		const num = BigInt(value);
		return num >= 0n;
	} catch {
		return false;
	}
}

export function formatUsdtAmount(atomicAmount: string | number): string {
	const amount = typeof atomicAmount === 'string' ? BigInt(atomicAmount) : BigInt(atomicAmount);
	const decimal = Number(amount) / 10 ** 6;
	return decimal.toFixed(6).replace(/\.?0+$/, '');
}
