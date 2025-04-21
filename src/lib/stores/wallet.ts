import { writable } from 'svelte/store';

interface WalletState {
  address: string;
  balance: number;
  connected: boolean;
  network: 'mainnet' | 'testnet' | 'liquid';
}

const initialState: WalletState = {
  address: '',
  balance: 0,
  connected: false,
  network: 'testnet'
};

export const walletStore = writable<WalletState>(initialState);

export function updateWalletBalance(balance: number) {
  walletStore.update(state => ({
    ...state,
    balance
  }));
}

export function setWalletAddress(address: string) {
  walletStore.update(state => ({
    ...state,
    address,
    connected: true
  }));
}

export function disconnectWallet() {
  walletStore.set(initialState);
}

export function setNetwork(network: 'mainnet' | 'testnet' | 'liquid') {
  walletStore.update(state => ({
    ...state,
    network
  }));
} 