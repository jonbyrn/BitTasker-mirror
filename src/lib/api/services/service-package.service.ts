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
		try {
			const response = await this.get<ServicePackage[]>(ENDPOINTS.SERVICE_PACKAGES.GET);
			return response.data;
		} catch (error) {
			console.error('Error fetching service packages:', error);
			throw error;
		}
	}

	/**
	 * Get all public service packages
	 */
	async getPublicPackages(): Promise<ServicePackage[]> {
		try {
			const response = await this.get<ServicePackage[]>(ENDPOINTS.SERVICE_PACKAGES.GET_PUBLIC);
			return response.data;
		} catch (error) {
			console.error('Error fetching public service packages:', error);
			throw error;
		}
	}

	/**
	 * Get a single service package by ID
	 */
	async getPackageById(id: string): Promise<ServicePackage> {
		try {
			const response = await this.get<ServicePackage>(ENDPOINTS.SERVICE_PACKAGES.GET_BY_ID(id));
			return response.data;
		} catch (error) {
			console.error(`Error fetching service package with ID ${id}:`, error);
			throw error;
		}
	}

	/**
	 * Create a new service package
	 */
	async createPackage(
		packageData: Omit<ServicePackage, 'id' | 'createdAt' | 'createdBy' | 'status'>
	): Promise<ServicePackage> {
		try {
			const response = await this.post<ServicePackage>(
				ENDPOINTS.SERVICE_PACKAGES.POST,
				packageData
			);
			return response.data;
		} catch (error) {
			console.error('Error creating service package:', error);
			throw error;
		}
	}

	/**
	 * Update an existing service package
	 */
	async updatePackage(id: string, packageData: Partial<ServicePackage>): Promise<ServicePackage> {
		try {
			const response = await this.put<ServicePackage>(
				ENDPOINTS.SERVICE_PACKAGES.UPDATE(id),
				packageData
			);
			return response.data;
		} catch (error) {
			console.error(`Error updating service package with ID ${id}:`, error);
			throw error;
		}
	}

	/**
	 * Delete a service package
	 */
	async deletePackage(id: string): Promise<void> {
		try {
			const response = await this.delete(ENDPOINTS.SERVICE_PACKAGES.DELETE(id));
			return response.data;
		} catch (error) {
			console.error(`Error deleting service package with ID ${id}:`, error);
			throw error;
		}
	}

	/**
	 * Purchase a public service package
	 * This creates task templates for the user based on the package
	 */
	async purchasePackage(id: string): Promise<void> {
		try {
			const response = await this.post(ENDPOINTS.SERVICE_PACKAGES.PURCHASE_PACKAGE(id));
			return response.data;
		} catch (error) {
			console.error(`Error purchasing service package with ID ${id}:`, error);
			throw error;
		}
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
