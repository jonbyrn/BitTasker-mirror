import createAxiosInstance from '$lib/api/axios';
import type { Bid } from '$lib/types/bid';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_PATH = '/api/v1/bid';

const bidApi = createAxiosInstance({ baseURL: API_URL });

export async function createBid(bid: Bid): Promise<Bid> {
	const response = await bidApi.post(API_PATH, bid);
	return response.data;
}

export async function updateBid(bid: Bid): Promise<Bid> {
	const response = await bidApi.put(API_PATH, bid);
	return response.data;
}

export async function withdrawBid(bidId: string): Promise<void> {
	const response = await bidApi.post(`${API_PATH}/${bidId}/withdraw`);
	if (!response.data) {
		throw new Error('Failed to withdraw bid');
	}
}
