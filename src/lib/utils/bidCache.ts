import type { BidMessage } from './nostr-bid';

interface CachedBid {
	data: BidMessage;
	timestamp: number;
}

interface BidCacheMetadata {
	lastFetchTime: number;
	lastMessageId: string; // Track last processed message for incremental updates
}

class SmartBidCache {
	private cache: Map<string, CachedBid> = new Map();
	private metadata: Map<string, BidCacheMetadata> = new Map();
	
	// Smart TTL based on bid status
	getTTL(bid: BidMessage): number {
		const status = bid.bid.bidStatus;
		if (status === 'PENDING' || status === 'COUNTERED') {
			return 30 * 1000; // 30 seconds for active bids
		} else if (status === 'ACCEPTED' || status === 'REJECTED') {
			return 5 * 60 * 1000; // 5 minutes for completed bids
		}
		return 10 * 60 * 1000; // 10 minutes for others
	}
	
	isStale(bidId: string): boolean {
		const cached = this.cache.get(bidId);
		if (!cached) return true;
		
		// Reconstruct bid to check status
		const age = Date.now() - cached.timestamp;
		const ttl = this.getTTL(cached.data);
		return age > ttl;
	}
	
	getUserBids(userPubkey: string): BidMessage[] {
		return Array.from(this.cache.values())
			.map(c => c.data)
			.filter(bid => bid.senderPubkey === userPubkey)
			.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	}
	
	getStaleBidIds(userPubkey: string): string[] {
		return this.getUserBids(userPubkey)
			.filter(bid => this.isStale(bid.bid.bidId))
			.map(bid => bid.bid.bidId);
	}
	
	// Get last fetch metadata for incremental updates
	getLastFetchTime(userPubkey: string): number {
		return this.metadata.get(userPubkey)?.lastFetchTime || 0;
	}
	
	setLastFetchTime(userPubkey: string, time: number): void {
		const existing = this.metadata.get(userPubkey) || { 
			lastFetchTime: 0, 
			lastMessageId: '' 
		};
		this.metadata.set(userPubkey, { ...existing, lastFetchTime: time });
	}
	
	set(bidId: string, bid: BidMessage): void {
		this.cache.set(bidId, {
			data: bid,
			timestamp: Date.now()
		});
	}
	
	get(bidId: string): BidMessage | undefined {
		const cached = this.cache.get(bidId);
		return cached ? cached.data : undefined;
	}
	
	updateBidStatus(bidId: string, status: string): void {
		const cached = this.cache.get(bidId);
		if (cached) {
			cached.data.bid.bidStatus = status;
			cached.timestamp = Date.now(); // Update timestamp for new TTL
		}
	}
	
	clear(): void {
		this.cache.clear();
		this.metadata.clear();
	}
	
	// Get all bids for a specific task
	getTaskBids(taskId: string): BidMessage[] {
		return Array.from(this.cache.values())
			.map(c => c.data)
			.filter(bid => bid.bid.taskId === taskId)
			.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	}
	
	// Check if we have any cached bids for a user
	hasUserBids(userPubkey: string): boolean {
		return this.getUserBids(userPubkey).length > 0;
	}
}

export const smartBidCache = new SmartBidCache();
