import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Upload Service
 * Handles file uploads for the BitTasker platform
 */
class UploadService extends BaseApiService {
	/**
	 * Upload a single file
	 * @param file The file to upload
	 * @param folder The folder to store the file in
	 * @returns Promise containing the url and key of the uploaded file
	 * @throws Error if upload fails
	 */
	async uploadSingleFile(file: File, folder: string): Promise<{ url: string; key: string }> {
		const formData = new FormData();
		formData.append('file', file);

		// Use the appropriate endpoint with folder query parameter
		const response = await this.post<{ url: string; key: string }>(
			`${ENDPOINTS.UPLOADS.SINGLE}?folder=${folder}`,
			formData,
			{
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			}
		);

		return response.data;
	}

	/**
	 * Upload multiple files
	 * @param files The files to upload
	 * @param folder The folder to store the files in
	 * @returns Promise containing an array of urls and keys of the uploaded files
	 * @throws Error if upload fails
	 */
	async uploadMultipleFiles(
		files: File[],
		folder: string = 'tasks'
	): Promise<Array<{ url: string; key: string }>> {
		const formData = new FormData();

		// Append each file to the form data
		files.forEach((file) => {
			formData.append(`files`, file);
		});

		// Use the appropriate endpoint with folder query parameter
		const response = await this.post<Array<{ url: string; key: string }>>(
			`${ENDPOINTS.UPLOADS.MULTIPLE}?folder=${folder}`,
			formData,
			{
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			}
		);

		return response.data;
	}

	/**
	 * Delete a file by its key
	 * @param key The key of the file to delete
	 * @returns Promise that resolves when deletion is successful
	 * @throws Error if deletion fails
	 */
	async deleteFile(key: string): Promise<void> {
		await this.delete(ENDPOINTS.UPLOADS.DELETE(key));
	}
}

// Create singleton instance
const uploadService = new UploadService();
export default uploadService;
