import type { Bid, BidsResponse, CounterOffer, CreateBidParams } from '$lib/types/bid';
import type { Task } from '../types';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import taskService from '$lib/api/services/task.service';

/**
 * Bid Service
 * Handles bid creation, updates, and management for tasks
 */
export class BidService extends BaseApiService {
	// Using ENDPOINTS for all API paths

	/**
	 * Get all bids
	 * @returns Promise containing array of all bids
	 * @throws Error if bid retrieval fails
	 */
	async getUserBids(): Promise<BidsResponse> {
		const response = await this.get<BidsResponse>(ENDPOINTS.BIDS.GET);
		return response.data;
	}
	/**
	 * Create a new bid for a task
	 * @param bid The bid information to create
	 * @returns Promise containing the created bid data
	 * @throws Error if bid creation fails
	 */
	async createBid(bid: CreateBidParams): Promise<Bid> {
		const response = await this.post<Bid>(ENDPOINTS.BIDS.CREATE, bid);
		return response.data;
	}

	/**
	 * Update an existing bid
	 * @param bid The updated bid information
	 * @returns Promise containing the updated bid data
	 * @throws Error if bid update fails
	 */
	async updateBid(bid: Bid): Promise<Bid> {
		const response = await this.put<Bid>(ENDPOINTS.BIDS.UPDATE(bid.id));
		return response.data;
	}

	/**
	 * Withdraw a bid from a task
	 * @param bidId The ID of the bid to withdraw
	 * @returns Promise that resolves when withdrawal is successful
	 * @throws Error if bid withdrawal fails
	 */
	async withdrawBid(bidId: string): Promise<void> {
		const response = await this.post(ENDPOINTS.BIDS.WITHDRAW(bidId));
		return response.data;
	}
	/**
	 * Accept a bid
	 * @param bidId The ID of the bid to accept
	 * @returns Promise that resolves when acceptance is successful
	 * @throws Error if bid acceptance fails
	 */
	async acceptBid(bidId: string): Promise<void> {
		const response = await this.post(`${ENDPOINTS.BIDS.GET}/${bidId}/accept`);
		return response.data;
	}

	/**
	 * Reject a bid
	 * @param bidId The ID of the bid to reject
	 * @returns Promise that resolves when rejection is successful
	 * @throws Error if bid rejection fails
	 */
	async rejectBid(bidId: string): Promise<void> {
		const response = await this.post(`${ENDPOINTS.BIDS.GET}/${bidId}/reject`);
		return response.data;
	}

	/**
	 * Create a counter offer for a bid
	 * @param bidId The ID of the bid to counter
	 * @param counterOffer The counter offer data
	 * @returns Promise containing the created counter offer
	 * @throws Error if counter offer creation fails
	 */
	async createCounterOffer(
		bidId: string, 
		counterOffer: Omit<CounterOffer, 'id' | 'bidId' | 'createdAt' | 'status'>
	): Promise<CounterOffer> {
		const response = await this.post(
			`${ENDPOINTS.BIDS.GET}/${bidId}/counter-offers`, 
			counterOffer
		);
		return response.data;
	}

	/**
	 * Respond to a counter offer (accept or reject)
	 * @param counterId The ID of the counter offer
	 * @param action The action to take ('accept' or 'reject')
	 * @returns Promise that resolves when the response is successful
	 * @throws Error if response fails
	 */
	async respondToCounterOffer(
		counterId: string, 
		action: 'accept' | 'reject'
	): Promise<void> {
		const response = await this.post(
			`${ENDPOINTS.BIDS.GET}/counter-offers/${counterId}/${action}`
		);
		return response.data;
	}
}

// Create singleton instance
const bidService = new BidService();
export default bidService;
