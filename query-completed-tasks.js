#!/usr/bin/env node

/**
 * Script to query the BitTasker escrow smart contract and count completed/resolved tasks by address
 * 
 * Usage:
 *   node query-completed-tasks.js [--network=testnet|mainnet] [--contract=0x...]
 * 
 * Environment variables:
 *   VITE_RSK_NETWORK - Network to use (testnet or mainnet)
 *   VITE_RSK_CONTRACT_ADDRESS_TESTNET - Contract address for testnet
 *   VITE_RSK_CONTRACT_ADDRESS_MAINNET - Contract address for mainnet
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if it exists
function loadEnvFile() {
	const envPath = join(__dirname, '.env');
	if (existsSync(envPath)) {
		const envContent = readFileSync(envPath, 'utf-8');
		envContent.split('\n').forEach(line => {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#')) {
				const match = trimmed.match(/^([^=]+)=(.*)$/);
				if (match) {
					const key = match[1].trim();
					let value = match[2].trim();
					// Remove quotes if present
					if ((value.startsWith('"') && value.endsWith('"')) || 
					    (value.startsWith("'") && value.endsWith("'"))) {
						value = value.slice(1, -1);
					}
					if (!process.env[key]) {
						process.env[key] = value;
					}
				}
			}
		});
	}
}

// Load environment variables from .env file
loadEnvFile();

// Escrow status enum values
const EscrowStatus = {
	Funded: 0,
	InDispute: 1,
	DisputeResolved: 2,
	DisputeUnresolved: 3,
	Completed: 4,
	Cancelled: 5
};

// Network configuration
const RSK_NETWORKS = {
	mainnet: {
		name: 'RSK Mainnet',
		chainId: 30,
		rpcUrl: 'https://public-node.rsk.co',
	},
	testnet: {
		name: 'RSK Testnet',
		chainId: 31,
		rpcUrl: 'https://public-node.testnet.rsk.co',
	}
};

// Parse command line arguments
const args = process.argv.slice(2);
let network = process.env.VITE_RSK_NETWORK || 'testnet';
let contractAddress = null;

args.forEach(arg => {
	if (arg.startsWith('--network=')) {
		network = arg.split('=')[1];
	} else if (arg.startsWith('--contract=')) {
		contractAddress = arg.split('=')[1];
	}
});

// Get contract address from env or command line
if (!contractAddress) {
	// Try network-specific first
	const envVar = network === 'mainnet' 
		? 'VITE_RSK_CONTRACT_ADDRESS_MAINNET'
		: 'VITE_RSK_CONTRACT_ADDRESS_TESTNET';
	contractAddress = process.env[envVar];
	
	// Fallback to generic contract address
	if (!contractAddress) {
		contractAddress = process.env.VITE_RSK_CONTRACT_ADDRESS;
	}
}

if (!contractAddress) {
	console.error(`Error: Contract address not found. Please set ${network === 'mainnet' ? 'VITE_RSK_CONTRACT_ADDRESS_MAINNET' : 'VITE_RSK_CONTRACT_ADDRESS_TESTNET'} environment variable or use --contract=0x...`);
	process.exit(1);
}

// Ensure contract address is properly checksummed
try {
	// First normalize to lowercase, then checksum
	contractAddress = ethers.getAddress(contractAddress.toLowerCase());
} catch (error) {
	console.error(`Error: Invalid contract address format: ${contractAddress}`);
	console.error(`Details: ${error.message}`);
	process.exit(1);
}

// Load ABI
const abiPath = join(__dirname, 'src/lib/utils/escrow/v1/abi.json');
let escrowABI;
try {
	const abiContent = readFileSync(abiPath, 'utf-8');
	escrowABI = JSON.parse(abiContent);
} catch (error) {
	console.error(`Error loading ABI from ${abiPath}:`, error.message);
	process.exit(1);
}

// Get network config
const networkConfig = RSK_NETWORKS[network];
if (!networkConfig) {
	console.error(`Error: Unknown network "${network}". Use "testnet" or "mainnet"`);
	process.exit(1);
}

console.log(`\n🔍 Querying ${networkConfig.name}...`);
console.log(`📋 Contract: ${contractAddress}`);
console.log(`🌐 RPC: ${networkConfig.rpcUrl}\n`);

async function queryCompletedTasks() {
	try {
		// Connect to provider
		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
		
		// Create contract instance
		const contract = new ethers.Contract(contractAddress, escrowABI, provider);
		
		// Get total number of escrows
		console.log('📊 Fetching escrow count...');
		const nextEscrowId = await contract.nextEscrowId();
		const totalEscrows = Number(nextEscrowId);
		console.log(`   Found ${totalEscrows} total escrows\n`);
		
		if (totalEscrows === 0) {
			console.log('No escrows found.');
			return;
		}
		
		// Count tasks by address
		const addressCounts = new Map(); // address -> { completed: number, resolved: number }
		const escrowDetails = []; // Store all escrow details for display
		
		// Status mapping to human-readable names
		const statusNames = {
			[EscrowStatus.Funded]: 'Funded',
			[EscrowStatus.InDispute]: 'Dispute',
			[EscrowStatus.DisputeResolved]: 'Resolved',
			[EscrowStatus.DisputeUnresolved]: 'Dispute Unresolved',
			[EscrowStatus.Completed]: 'Completed',
			[EscrowStatus.Cancelled]: 'Cancelled'
		};
		
		// Query escrows in batches to avoid overwhelming the RPC
		const batchSize = 50;
		let processed = 0;
		
		console.log('🔎 Querying escrows...');
		
		for (let i = 0; i < totalEscrows; i += batchSize) {
			const batch = [];
			const end = Math.min(i + batchSize, totalEscrows);
			
			for (let j = i; j < end; j++) {
				batch.push(contract.escrows(j).catch(err => {
					// Skip invalid escrow IDs (might not exist)
					return null;
				}));
			}
			
			const results = await Promise.all(batch);
			
			for (let k = 0; k < results.length; k++) {
				const escrowData = results[k];
				if (!escrowData) continue;
				
				const escrowId = i + k;
				const state = Number(escrowData.state);
				const client = escrowData.client.toLowerCase();
				const freelancer = escrowData.freelancer.toLowerCase();
				const statusName = statusNames[state] || `Unknown (${state})`;
				
				// Store escrow details for display
				escrowDetails.push({
					id: escrowId,
					client,
					freelancer,
					status: statusName,
					state
				});
				
				// Count completed tasks (state 4)
				if (state === EscrowStatus.Completed) {
					// Count for both client and freelancer
					if (!addressCounts.has(client)) {
						addressCounts.set(client, { completed: 0, resolved: 0 });
					}
					if (!addressCounts.has(freelancer)) {
						addressCounts.set(freelancer, { completed: 0, resolved: 0 });
					}
					addressCounts.get(client).completed++;
					addressCounts.get(freelancer).completed++;
				}
				
				// Count resolved tasks (state 2)
				if (state === EscrowStatus.DisputeResolved) {
					if (!addressCounts.has(client)) {
						addressCounts.set(client, { completed: 0, resolved: 0 });
					}
					if (!addressCounts.has(freelancer)) {
						addressCounts.set(freelancer, { completed: 0, resolved: 0 });
					}
					addressCounts.get(client).resolved++;
					addressCounts.get(freelancer).resolved++;
				}
			}
			
			processed += results.length;
			process.stdout.write(`\r   Processed ${processed}/${totalEscrows} escrows...`);
		}
		
		console.log('\n');
		
		// Display all escrows with their statuses
		console.log('📋 All Escrows:\n');
		escrowDetails.forEach(({ client, freelancer, status }) => {
			console.log(`${client} - ${freelancer}: ${status}`);
		});
		console.log('');
		
		// Convert to array and calculate total completed/resolved tasks per address
		const addressStats = Array.from(addressCounts.entries()).map(([address, counts]) => ({
			address,
			completed: counts.completed,
			resolved: counts.resolved,
			total: counts.completed + counts.resolved
		}));
		
		// Filter out addresses with 0 completed/resolved tasks
		const filteredStats = addressStats.filter(stat => stat.total > 0);
		
		// Sort by total completed/resolved tasks (descending)
		filteredStats.sort((a, b) => b.total - a.total);
		
		// Output CSV format
		console.log('Address,Completed Tasks\n');
		filteredStats.forEach(({ address, total }) => {
			console.log(`${address},${total}`);
		});
		
		console.log(`\n✅ Query complete! Found ${addressStats.length} addresses with completed tasks.`);
		
	} catch (error) {
		console.error('\n❌ Error querying contract:', error.message);
		if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
			console.error('   This might be a network connectivity issue. Please try again.');
		}
		process.exit(1);
	}
}

// Run the query
queryCompletedTasks();

