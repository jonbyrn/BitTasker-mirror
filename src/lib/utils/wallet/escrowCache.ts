/**
 * Smart Escrow Cache with Stale-While-Revalidate Pattern
 * 
 * Provides instant loading of cached escrow data while refreshing in background.
 * Uses different TTL for active vs completed escrows for optimal performance.
 */

import type { EscrowData } from '$lib/types/wallet';

interface CachedEscrow {
  data: EscrowData;
  timestamp: number;
}

interface CacheMetadata {
  lastKnownEscrowId: number;
}

const CACHE_KEY = 'escrow_cache';
const METADATA_KEY = 'escrow_cache_metadata';
const ACTIVE_ESCROW_TTL = 60 * 1000; // 1 minute for active/pending escrows
const COMPLETED_ESCROW_TTL = 10 * 60 * 1000; // 10 minutes for completed escrows

export class EscrowCache {
  private cache: Map<string, CachedEscrow> = new Map();
  private metadata: CacheMetadata | null = null;

  constructor() {
    this.loadFromStorage();
  }

  get(escrowId: string): EscrowData | null {
    const cached = this.cache.get(escrowId);
    if (!cached) return null;
    return cached.data;
  }

  isStale(escrowId: string): boolean {
    const cached = this.cache.get(escrowId);
    if (!cached) return true;

    const age = Date.now() - cached.timestamp;
    const escrow = cached.data;
    
    const isActive = escrow.status === 'Funded' || escrow.status === 'InDispute';
    const ttl = isActive ? ACTIVE_ESCROW_TTL : COMPLETED_ESCROW_TTL;
    
    return age > ttl;
  }

  set(escrowId: string, data: EscrowData): void {
    this.cache.set(escrowId, {
      data,
      timestamp: Date.now()
    });
    this.saveToStorage();
  }

  setLastKnownId(lastKnownEscrowId: number): void {
    this.metadata = { lastKnownEscrowId };
    this.saveMetadata();
  }

  getLastKnownId(): number {
    return this.metadata?.lastKnownEscrowId || 0;
  }

  getUserEscrows(userAddress: string): EscrowData[] {
    const userAddr = userAddress.toLowerCase();
    return Array.from(this.cache.values())
      .map(c => c.data)
      .filter(escrow => {
        const clientAddr = escrow.client.toLowerCase();
        const freelancerAddr = escrow.freelancer.toLowerCase();
        return clientAddr === userAddr || freelancerAddr === userAddr;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getStaleEscrowIds(userAddress: string): string[] {
    return this.getUserEscrows(userAddress)
      .filter(escrow => this.isStale(escrow.id))
      .map(escrow => escrow.id);
  }

  invalidate(escrowId?: string): void {
    if (escrowId) {
      this.cache.delete(escrowId);
    } else {
      this.cache.clear();
      this.metadata = null;
    }
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        this.cache = new Map(JSON.parse(stored));
      }
      
      const metaStored = localStorage.getItem(METADATA_KEY);
      if (metaStored) {
        this.metadata = JSON.parse(metaStored);
      }
    } catch (error) {
      console.warn('Failed to load escrow cache:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(this.cache.entries())));
    } catch (error) {
      console.warn('Failed to save escrow cache:', error);
    }
  }

  private saveMetadata(): void {
    try {
      if (this.metadata) {
        localStorage.setItem(METADATA_KEY, JSON.stringify(this.metadata));
      }
    } catch (error) {
      console.warn('Failed to save cache metadata:', error);
    }
  }

  clear(): void {
    this.cache.clear();
    this.metadata = null;
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(METADATA_KEY);
  }
}

export const escrowCache = new EscrowCache();
