import { ethers, formatUnits, type ContractInterface, type Log } from 'ethers';
import type { BscEscrowEvent, BscEscrowEventType } from '$lib/types/escrow';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('escrow:decodeEvents');

/**
 * USDT decimals for formatting amounts
 */
const USDT_DECIMALS = 6;

/**
 * Map solidity event names to application event types
 */
const EVENT_NAME_TO_TYPE: Record<string, BscEscrowEventType> = {
	EscrowCreated: 'CREATED',
	EscrowFunded: 'FUNDED',
	TaskCompleted: 'COMPLETED',
	TaskDisputed: 'DISPUTED',
	EscrowResolved: 'RELEASED'
};

/**
 * Decode a single escrow event from a blockchain log
 *
 * This function parses raw blockchain logs using the contract ABI interface
 * and extracts meaningful escrow event data.
 *
 * ROBUSTNESS: Handles decoding errors gracefully by returning null rather than
 * throwing exceptions. This allows safe processing of unknown or malformed events.
 *
 * @param log - Blockchain log to decode
 * @param abi - Contract ABI interface (from ethers.js)
 * @returns Decoded event if successful, null if decoding fails or event is unknown
 *
 * @example
 * const abi = new ethers.Interface(contractAbi);
 * const decoded = decodeBscEscrowEvent(log, abi);
 * if (decoded) {
 *   console.log(`Event: ${decoded.type}, Amount: ${decoded.amountUSDT} USDT`);
 * }
 */
export function decodeBscEscrowEvent(log: Log, abi: ContractInterface): BscEscrowEvent | null {
	try {
		// Parse the log using the ABI
		const iface = typeof abi === 'string' ? new ethers.Interface(abi) : abi;
		const parsed = iface.parseLog(log);

		if (!parsed) {
			d.debug('Log does not match any known event', { signature: log.topics?.[0] });
			return null;
		}

		// Map event name to type
		const eventType = EVENT_NAME_TO_TYPE[parsed.name];
		if (!eventType) {
			d.debug('Unknown event type', { eventName: parsed.name });
			return null;
		}

		// Extract event fields based on type
		const event = parseEventFields(parsed, eventType, log);

		if (!event) {
			return null;
		}

		d.log('Decoded escrow event', { type: eventType, escrowId: event.escrowId });
		return event;
	} catch (error) {
		d.debug('Failed to decode log', { error: error instanceof Error ? error.message : error });
		return null;
	}
}

/**
 * Parse event fields based on event type
 *
 * Different event types have different field structures in the contract.
 * This function extracts the relevant fields for each type.
 *
 * @param parsed - Parsed log from ethers Interface
 * @param eventType - Mapped event type
 * @param log - Original log for block/tx information
 * @returns Decoded event or null if fields are missing/invalid
 */
function parseEventFields(
	parsed: ethers.LogDescription,
	eventType: BscEscrowEventType,
	log: Log
): BscEscrowEvent | null {
	try {
		// Common fields present in all events
		const escrowId = extractField(parsed.args, 'escrowId', 'string');
		const timestamp = extractField(parsed.args, 'timestamp', 'number');

		if (!escrowId) {
			d.warn('Missing required field: escrowId', { eventName: parsed.name });
			return null;
		}

		// Type-specific fields
		let senderAddress = '';
		let recipientAddress = '';
		let amountUSDT = '0';
		let status = '';

		switch (eventType) {
			case 'CREATED': {
				// EscrowCreated(uint256 indexed escrowId, address indexed client, address indexed freelancer, uint256 amount)
				const client = extractField(parsed.args, 'client', 'string');
				const freelancer = extractField(parsed.args, 'freelancer', 'string');
				const amount = extractField(parsed.args, 'amount', 'bigint');

				if (!client || !freelancer || !amount) {
					d.warn('Missing fields in CREATED event', {
						hasClient: !!client,
						hasFreelancer: !!freelancer,
						hasAmount: !!amount
					});
					return null;
				}

				senderAddress = client;
				recipientAddress = freelancer;
				amountUSDT = formatAmount(amount);
				status = 'CREATED';
				break;
			}

			case 'FUNDED': {
				// EscrowFunded(uint256 indexed escrowId, address indexed funder, uint256 amount)
				const funder = extractField(parsed.args, 'funder', 'string');
				const amount = extractField(parsed.args, 'amount', 'bigint');

				if (!funder || !amount) {
					d.warn('Missing fields in FUNDED event', { hasFunder: !!funder, hasAmount: !!amount });
					return null;
				}

				senderAddress = funder;
				amountUSDT = formatAmount(amount);
				status = 'FUNDED';
				break;
			}

			case 'COMPLETED': {
				// TaskCompleted(uint256 indexed escrowId)
				status = 'COMPLETED';
				break;
			}

			case 'DISPUTED': {
				// TaskDisputed(uint256 indexed escrowId, address indexed disputer)
				const disputer = extractField(parsed.args, 'disputer', 'string');
				if (disputer) {
					senderAddress = disputer;
				}
				status = 'DISPUTED';
				break;
			}

			case 'RELEASED': {
				// EscrowResolved(uint256 indexed escrowId, uint256 freelancerAmount, uint256 platformFee)
				const freelancerAmount = extractField(parsed.args, 'freelancerAmount', 'bigint');
				if (freelancerAmount) {
					amountUSDT = formatAmount(freelancerAmount);
				}
				status = 'RELEASED';
				break;
			}
		}

		return {
			type: eventType,
			escrowId,
			senderAddress,
			recipientAddress,
			amountUSDT,
			status,
			timestamp: timestamp || Math.floor(Date.now() / 1000),
			blockNumber: log.blockNumber,
			transactionHash: log.transactionHash
		};
	} catch (error) {
		d.debug('Error parsing event fields', {
			eventName: parsed.name,
			error: error instanceof Error ? error.message : error
		});
		return null;
	}
}

/**
 * Extract a field from parsed event arguments with type coercion
 *
 * @param args - Event arguments object
 * @param fieldName - Field to extract
 * @param expectedType - Expected type ('string', 'number', 'bigint')
 * @returns Extracted and coerced value, or null if not found or wrong type
 */
function extractField(
	args: Record<string, any>,
	fieldName: string,
	expectedType: 'string' | 'number' | 'bigint'
): string | number | bigint | null {
	const value = args[fieldName];

	if (value === undefined || value === null) {
		return null;
	}

	try {
		switch (expectedType) {
			case 'string': {
				// Handle address values (0x...)
				if (typeof value === 'string') {
					return value;
				}
				// Try to convert
				return String(value);
			}

			case 'number': {
				// Handle numeric values
				if (typeof value === 'number') {
					return value;
				}
				if (typeof value === 'bigint') {
					return Number(value);
				}
				return parseInt(String(value), 10);
			}

			case 'bigint': {
				// Handle BigInt values
				if (typeof value === 'bigint') {
					return value;
				}
				if (typeof value === 'number') {
					return BigInt(value);
				}
				return BigInt(String(value));
			}
		}
	} catch (error) {
		d.debug('Error coercing field', { fieldName, expectedType, error });
		return null;
	}
}

/**
 * Format a BigInt amount to human-readable USDT string
 *
 * @param amount - Amount in atomic units (wei)
 * @returns Formatted amount with 6 decimal places
 *
 * @example
 * formatAmount(100500000n) // '100.500000'
 */
function formatAmount(amount: bigint): string {
	try {
		// Format with USDT decimals (6)
		const formatted = formatUnits(amount, USDT_DECIMALS);

		// Ensure we preserve all 6 decimal places
		// formatUnits may return '100.5' instead of '100.500000'
		const parts = formatted.split('.');
		if (parts.length === 2) {
			const decimals = parts[1].padEnd(USDT_DECIMALS, '0');
			return `${parts[0]}.${decimals}`;
		}

		return formatted;
	} catch (error) {
		d.warn('Failed to format amount', { amount: amount.toString(), error });
		return '0.000000';
	}
}

/**
 * Batch decode multiple logs from the same transaction
 *
 * Useful for processing all events from a single transaction receipt.
 *
 * @param logs - Array of logs to decode
 * @param abi - Contract ABI interface
 * @returns Array of successfully decoded events
 */
export function decodeBscEscrowEvents(logs: Log[], abi: ContractInterface): BscEscrowEvent[] {
	const events: BscEscrowEvent[] = [];

	for (const log of logs) {
		const event = decodeBscEscrowEvent(log, abi);
		if (event) {
			events.push(event);
		}
	}

	return events;
}

/**
 * Find escrow events by type from a batch
 *
 * @param events - Array of decoded events
 * @param type - Event type to filter by
 * @returns Array of events matching the type
 */
export function filterEscrowEventsByType(
	events: BscEscrowEvent[],
	type: BscEscrowEventType
): BscEscrowEvent[] {
	return events.filter((e) => e.type === type);
}

/**
 * Find escrow events by escrow ID from a batch
 *
 * @param events - Array of decoded events
 * @param escrowId - Escrow ID to filter by
 * @returns Array of events for the escrow ID
 */
export function filterEscrowEventsByEscrowId(
	events: BscEscrowEvent[],
	escrowId: string
): BscEscrowEvent[] {
	return events.filter((e) => e.escrowId === escrowId);
}
