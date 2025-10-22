/**
 * Service Package Service
 *
 * Handles API interactions for service packages in BitTasker
 */
import type { ServicePackage } from '$lib/types/recurring-tasks';
import { ENDPOINTS } from '../endpoints';
import { BaseApiService } from '../apiService';

class ServicePackageService extends BaseApiService {
	/**
	 * Get all service packages for the current user
	 */
	async getPackages(): Promise<ServicePackage[]> {
		const response = await this.get<ServicePackage[]>(ENDPOINTS.SERVICE_PACKAGES.GET);
		return response.data;
	}

	/**
	 * Get all public service packages
	 */
	async getPublicPackages(): Promise<ServicePackage[]> {
		const response = await this.get<ServicePackage[]>(ENDPOINTS.SERVICE_PACKAGES.GET_PUBLIC);
		return response.data;
	}

	/**
	 * Get a single service package by ID
	 */
	async getPackageById(id: string): Promise<ServicePackage> {
		const response = await this.get<ServicePackage>(ENDPOINTS.SERVICE_PACKAGES.GET_BY_ID(id));
		return response.data;
	}

	/**
	 * Create a new service package
	 */
	async createPackage(
		packageData: Omit<ServicePackage, 'id' | 'createdAt' | 'createdBy' | 'status'>
	): Promise<ServicePackage> {
		const response = await this.post<ServicePackage>(
			ENDPOINTS.SERVICE_PACKAGES.POST,
			packageData
		);
		return response.data;
	}

	/**
	 * Update an existing service package
	 */
	async updatePackage(id: string, packageData: Partial<ServicePackage>): Promise<ServicePackage> {
		const response = await this.put<ServicePackage>(
			ENDPOINTS.SERVICE_PACKAGES.UPDATE(id),
			packageData
		);
		return response.data;
	}

	/**
	 * Delete a service package
	 */
	async deletePackage(id: string): Promise<void> {
		const response = await this.delete(ENDPOINTS.SERVICE_PACKAGES.DELETE(id));
		return response.data;
	}

	/**
	 * Purchase a public service package
	 * This creates task templates for the user based on the package
	 */
	async purchasePackage(id: string): Promise<void> {
		const response = await this.post(ENDPOINTS.SERVICE_PACKAGES.PURCHASE_PACKAGE(id));
		return response.data;
	}

	/**
	 * Calculate the total price for a service package, applying the bundle discount
	 */
	calculatePackagePrice(basePrice: number, discount: number): number {
		if (discount < 0 || discount > 100) {
			throw new Error('Discount percentage must be between 0 and 100');
		}
		return basePrice * (1 - discount / 100);
	}
}

export default new ServicePackageService();
