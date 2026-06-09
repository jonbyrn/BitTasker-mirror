// Mock for viem module
export function createPublicClient(config: any) {
  return config;
}

export function http(url?: string) {
  return url || 'mock-transport';
}

export function encodeFunctionData(params: any): `0x${string}` {
  return '0xencodeddata';
}

export function keccak256(data: any): `0x${string}` {
  return '0x0000000000000000000000000000000000000000000000000000000000000001';
}

export function encodeAbiParameters(types: any[], values: any[]): `0x${string}` {
  return '0xencodedparams';
}

export function toBytes(data: string): Uint8Array {
  return new Uint8Array(32);
}

export function pad(data: any, opts?: any): `0x${string}` {
  return '0xpadded';
}

export type Address = `0x${string}`;
