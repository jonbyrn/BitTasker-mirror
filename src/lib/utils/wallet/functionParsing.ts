/**
 * Function Parsing & Decoding Utility
 * 
 * Parses transaction input data to extract function selectors, decode function names,
 * and extract parameters from known contract ABIs.
 */

import { Interface } from 'ethers';
import escrowABI from '../constants/escrowABI.json';
import { hasContractInteraction } from './contractDetection';

interface ParsedFunction {
	functionName: string | null;
	functionSelector: string;
	parameters: Record<string, any>;
	escrowId?: string;
}

// Common ERC-20/ERC-721 function selectors
const COMMON_FUNCTION_SELECTORS: Record<string, string> = {
	'0xa9059cbb': 'transfer',
	'0x23b872dd': 'transferFrom',
	'0x095ea7b3': 'approve',
	'0x42842e0e': 'safeTransferFrom',
	'0xb88d4fde': 'safeTransferFrom',
	'0x40c10f19': 'mint',
	'0x42966c68': 'burn'
};

// Escrow function selectors (computed from ABI)
let escrowInterface: Interface | null = null;
let escrowFunctionSelectors: Map<string, string> | null = null;

/**
 * Initialize escrow interface and function selectors
 */
function initializeEscrowInterface(): void {
	if (!escrowInterface) {
		escrowInterface = new Interface(escrowABI);
		escrowFunctionSelectors = new Map();
		
		// Build selector map from ABI
		for (const item of escrowABI) {
			if (item.type === 'function' && item.name) {
				try {
					const fragment = escrowInterface.getFunction(item.name);
					// In ethers v6, FunctionFragment has a selector property
					const selector = fragment?.selector;
					if (selector) {
						escrowFunctionSelectors.set(selector.toLowerCase(), item.name);
					}
				} catch (error) {
					// Skip invalid functions
				}
			}
		}
	}
}

/**
 * Extract function selector from transaction input data
 */
export function extractFunctionSelector(inputData: string | undefined | null): string | null {
	if (!inputData || inputData.length < 10) {
		return null;
	}

	// Remove 0x prefix if present
	const cleanInput = inputData.startsWith('0x') ? inputData.slice(2) : inputData;
	
	// Function selector is first 4 bytes (8 hex characters)
	if (cleanInput.length < 8) {
		return null;
	}

	const selector = '0x' + cleanInput.slice(0, 8).toLowerCase();
	return selector;
}

/**
 * Parse function from transaction input using Escrow ABI
 */
export function parseEscrowFunction(inputData: string): ParsedFunction | null {
	initializeEscrowInterface();
	
	if (!escrowInterface || !inputData) {
		return null;
	}

	try {
		const selector = extractFunctionSelector(inputData);
		if (!selector || !escrowFunctionSelectors) {
			return null;
		}

		const functionName = escrowFunctionSelectors.get(selector);
		if (!functionName) {
			return null;
		}

		// Decode function parameters
		const decoded = escrowInterface.decodeFunctionData(functionName, inputData);
		const parameters: Record<string, any> = {};
		
		// Get function fragment to get parameter names
		const fragment = escrowInterface.getFunction(functionName);
		fragment?.inputs.forEach((input, index) => {
			parameters[input.name] = decoded[index];
		});

		// Extract escrowId (first parameter for most escrow functions)
		let escrowId: string | undefined;
		if (parameters.escrowId !== undefined) {
			escrowId = parameters.escrowId.toString();
		}

		return {
			functionName,
			functionSelector: selector,
			parameters,
			escrowId
		};
	} catch (error) {
		// Failed to parse - not an escrow function or malformed data
		return null;
	}
}

/**
 * Decode unknown function name from selector
 */
export function decodeUnknownFunction(selector: string): string | null {
	if (!selector || selector.length !== 10) {
		return null;
	}

	const normalizedSelector = selector.toLowerCase();
	return COMMON_FUNCTION_SELECTORS[normalizedSelector] || null;
}

/**
 * Parse function from transaction input data
 */
export function parseFunction(
	inputData: string | undefined | null,
	contractType: 'escrow' | 'etherSwap' | 'unknown' | null
): ParsedFunction | null {
	if (!inputData || !hasContractInteraction(inputData)) {
		return null;
	}

	const selector = extractFunctionSelector(inputData);
	if (!selector) {
		return null;
	}

	// Try escrow function parsing first
	if (contractType === 'escrow' || contractType === null) {
		const escrowResult = parseEscrowFunction(inputData);
		if (escrowResult) {
			return escrowResult;
		}
	}

	// Try to decode as common function
	const functionName = decodeUnknownFunction(selector);
	if (functionName) {
		return {
			functionName,
			functionSelector: selector,
			parameters: {}
		};
	}

	// Return selector only if we can't decode
	return {
		functionName: null,
		functionSelector: selector,
		parameters: {}
	};
}

