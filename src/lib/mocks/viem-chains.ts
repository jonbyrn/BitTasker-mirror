// Mock for viem/chains module
export const arbitrum = {
  id: 42161,
  name: 'Arbitrum',
  network: 'arbitrum',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://arb1.arbitrum.io/rpc'] },
  },
};
