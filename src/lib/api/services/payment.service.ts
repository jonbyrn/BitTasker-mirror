import { BaseApiService } from "../apiService";
import { ENDPOINTS } from "../endpoints";

interface PaymentRequest {
    id: number;
    amount: number;
    memo: string;
    paymentMethod: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    completedAt: string;
    address: string;
    qrCode: string;
    uri: string;
}

class PaymentService extends BaseApiService {
    /**
     * Create a new Bitcoin payment request
     * @param amount The amount to invoice
     * @param paymentMethod The payment method to use
     * @param memo The memo to send with the invoice
     * @param expiresIn The number of seconds the invoice will be valid
     * @response 201: Payment request created successfully
     * @returns The payment request
    */
    async createPaymentRequest({ amount, paymentMethod, memo, expiresIn }: { amount: number, paymentMethod: string, memo: string, expiresIn: number }): Promise<PaymentRequest> {
        try {
            const response = await this.post(ENDPOINTS.PAYMENT.REQUEST, { amount, paymentMethod, memo, expiresIn });
            return response.data;
        } catch (error) {
            console.error('Failed to create payment request:', error);
            throw error;
        }
    }

    /**
     * Get all payment requests for the user
     * @response 200: Payment requests retrieved successfully
     * @returns The payment requests
     */
    async getPaymentRequests(): Promise<PaymentRequest[]> {
        try {
            const response = await this.get(ENDPOINTS.PAYMENT.REQUESTS);
            return response.data;
        } catch (error) {
            console.error('Failed to get payment requests:', error);
            throw error;
        }
    }

    /**
     * Get a payment request by ID
     * @param id The ID of the payment request
     * @response 200: Payment request retrieved successfully
     * @returns The payment request
     */
    async getPaymentRequestById(id: number): Promise<PaymentRequest> {
        try {
            const response = await this.get(ENDPOINTS.PAYMENT.REQUEST_BY_ID(id.toString()));
            return response.data;
        } catch (error) {
            console.error('Failed to get payment request by ID:', error);
            throw error;
        }
    }

    /**
     * Cancel a pending payment request
     * @param id The ID of the payment request
     * @response 200: Payment request cancelled successfully
     * @returns True if the payment request was cancelled successfully
     */
    async cancelPaymentRequest(id: number): Promise<void> {
        try {
            await this.delete(ENDPOINTS.PAYMENT.REQUEST_BY_ID(id.toString()));
        } catch (error) {
            console.error('Failed to cancel payment request:', error);
            throw error;
        }
    }

    /**
     * Check the status of a payment request
     * @param id The ID of the payment request
     * @response 200: Payment request status retrieved successfully
     * @returns The payment request status
     */
    async checkPaymentRequestStatus(id: number): Promise<PaymentRequest> {
        try {
            const response = await this.get(ENDPOINTS.PAYMENT.CHECK_STATUS(id.toString()));
            return response.data;
        } catch (error) {
            console.error('Failed to check payment request status:', error);
            throw error;
        }
    }
}

const paymentService = new PaymentService();
export default paymentService;