/**
 * Multicall utility for batching contract calls
 * 
 * Reduces network calls by batching multiple contract calls into a single transaction.
 * Falls back gracefully when Multicall3 is not available on the network.
 */

import { ethers } from 'ethers';
import { getMulticallAddress } from './networkConfig';
import type { NetworkType } from '$lib/types/wallet';

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[] returnData)'
];

export async function multicall(
  provider: ethers.JsonRpcProvider,
  network: NetworkType,
  calls: Array<{ target: string; allowFailure: boolean; callData: string }>
): Promise<Array<{ success: boolean; returnData: string }>> {
  const multicallAddress = getMulticallAddress(network);
  if (!multicallAddress) {
    throw new Error('Multicall not supported on this network');
  }

  const multicall = new ethers.Contract(multicallAddress, MULTICALL3_ABI, provider);
  const result = await multicall.aggregate3(calls);
  return result;
}

export async function batchGetEscrows(
  contract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  network: NetworkType,
  escrowIds: string[]
): Promise<Array<any | null>> {
  const calls = escrowIds.map(id => ({
    target: contract.target as string,
    allowFailure: true,
    callData: contract.interface.encodeFunctionData('getEscrow', [id])
  }));

  const results = await multicall(provider, network, calls);
  
  return results.map((result) => {
    if (!result.success) return null;
    try {
      return contract.interface.decodeFunctionResult('getEscrow', result.returnData)[0];
    } catch {
      return null;
    }
  });
}
