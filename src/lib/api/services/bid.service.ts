import type { Bid, CounterOffer } from '$lib/types/bid';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import { get } from 'svelte/store';
import { bidStore } from '$lib/stores/bid.store';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import taskService from '$lib/api/services/task.service';

/**
 * Bid Service
 * Handles bid creation, updates, and management for tasks
 */
export class BidService extends BaseApiService {
	// Using ENDPOINTS for all API paths

	/**
	 * Create a new bid for a task
	 * @param bid The bid information to create
	 * @returns Promise containing the created bid data
	 * @throws Error if bid creation fails
	 */
	async createBid(bid: Bid): Promise<Bid> {
		const response = await this.post<Bid>(ENDPOINTS.BIDS.CREATE, bid);
		const createdBid = response.data;
		
		// Update local store with the created bid
		bidStore.addBid(createdBid);
		
		return createdBid;
	}

	/**
	 * Update an existing bid
	 * @param bid The updated bid information
	 * @returns Promise containing the updated bid data
	 * @throws Error if bid update fails
	 */
	async updateBid(bid: Bid): Promise<Bid> {
		const response = await this.put<Bid>(ENDPOINTS.BIDS.UPDATE, bid);
		const updatedBid = response.data;
		
		// Update local store with the updated bid
		bidStore.updateBid(updatedBid);
		
		return updatedBid;
	}

	/**
	 * Withdraw a bid from a task
	 * @param bidId The ID of the bid to withdraw
	 * @returns Promise that resolves when withdrawal is successful
	 * @throws Error if bid withdrawal fails
	 */
	async withdrawBid(bidId: string): Promise<void> {
		const response = await this.post(ENDPOINTS.BIDS.WITHDRAW(bidId));
		if (!response.data) {
			throw new Error('Failed to withdraw bid');
		}
		
		// Update local store to reflect withdrawal
		bidStore.updateBidStatus(bidId, 'withdrawn');
	}
	
	/**
	 * Get all bids for a specific task
	 * @param taskId The ID of the task
	 * @returns Promise containing array of bids for the task
	 * 
	 * Note: Since API endpoint is missing, this uses the client-side store
	 */
	async getBidsForTask(taskId: string): Promise<Bid[]> {
		// This would ideally be an API call, but using store for now
		// Once the API endpoint is available, implement proper data fetching
		const bids = bidStore.getBidsByTaskId(taskId);
		return bids;
	}
	
	/**
	 * Get all bids submitted by the current user
	 * @param userId The user's ID (optional, defaults to current user)
	 * @returns Promise containing array of user's bids
	 * 
	 * Note: Since API endpoint is missing, this uses the client-side store
	 */
	async getUserBids(userId?: string): Promise<Bid[]> {
		// This would ideally be an API call, but using store for now
		// Once the API endpoint is available, implement proper data fetching
		if (userId) {
			return bidStore.getUserBids(userId);
		}
		
		// If no userId provided, the current user's ID should be obtained from userStore
		// For now, this is a placeholder approach
		let bids: Bid[] = get(bidStore).bids;
		return bids;
	}
	
	/**
	 * Accept a bid for a task
	 * @param bidId The ID of the bid to accept
	 * @param taskId The ID of the associated task
	 * @returns Promise that resolves when the bid is accepted
	 * 
	 * Note: Since API endpoint is missing, this simulates acceptance through task status update
	 */
	async acceptBid(bidId: string, taskId: string): Promise<void> {
		// Update local store to mark bid as accepted
		bidStore.updateBidStatus(bidId, 'accepted');
		
		// Reject all other bids for this task
		bidStore.rejectOtherBids(bidId, taskId);
		
		// Update task status to IN_PROGRESS when a bid is accepted
		// This is a workaround since we don't have a direct bid acceptance endpoint
		try {
			await taskService.updateTaskStatus(taskId, TaskStatusEnum.IN_PROGRESS);
		} catch (error) {
			console.error('Failed to update task status:', error);
			// If task status update fails, revert the bid status changes
			bidStore.updateBidStatus(bidId, 'pending');
			throw new Error('Failed to accept bid');
		}
	}
	
	/**
	 * Reject a bid for a task
	 * @param bidId The ID of the bid to reject
	 * @returns Promise that resolves when the bid is rejected
	 * 
	 * Note: Since API endpoint is missing, this uses the client-side store
	 */
	async rejectBid(bidId: string): Promise<void> {
		// Update local store to mark bid as rejected
		bidStore.updateBidStatus(bidId, 'rejected');
	}
	
	/**
	 * Create a counter-offer for a bid
	 * @param bidId The ID of the original bid
	 * @param counterOffer The counter-offer details
	 * @returns Promise that resolves when the counter-offer is created
	 * 
	 * Note: Since API endpoint is missing, this uses the client-side store
	 */
	async createCounterOffer(bidId: string, counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>): Promise<void> {
		// Add counter offer to store
		bidStore.addCounterOffer(bidId, counterOffer);
		
		// Ideally update the bid via API with counter offer information
		const bid = bidStore.getBidById(bidId);
		if (bid) {
			// When API supports it, update the bid with counter offer details
			// For now, only local store is modified
		}
	}
}

// Create singleton instance
const bidService = new BidService();
export default bidService;
