import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { Location } from '$lib/types/task';

/**
 * Location Service
 * Handles geocoding, location-based searches, and location data management
 */
export class LocationService extends BaseApiService {
  /**
   * Search for locations by query string
   * @param query The search query for location
   * @param limit Maximum number of results to return
   */
  async searchLocations(query: string, limit = 5): Promise<{
    locations: Array<{
      displayName: string;
      latitude: number;
      longitude: number;
      zipCode: string;
      city: string;
      state: string;
      country: string;
    }>;
  }> {
    const response = await this.get(ENDPOINTS.LOCATION.SEARCH, {
      params: { query, limit }
    });
    return response.data;
  }

  /**
   * Get the user's current location using browser geolocation
   * @returns Promise with location data
   * @throws Error if geolocation fails or is not supported
   */
  async getCurrentLocation(): Promise<Location> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          // Reverse geocode to get display name and zip code
          try {
            const { latitude, longitude } = position.coords;
            const response = await this.get(ENDPOINTS.LOCATION.REVERSE_GEOCODE, {
              params: { latitude, longitude }
            });
            
            resolve({
              displayName: response.data.displayName,
              latitude,
              longitude,
              zipCode: response.data.zipCode,
              locationLoaded: true
            });
          } catch (error) {
            reject(error);
          }
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  /**
   * Calculate distance between two locations
   * @param origin Origin location coordinates
   * @param destination Destination location coordinates
   * @returns Distance in kilometers
   */
  calculateDistance(
    origin: { latitude: number, longitude: number },
    destination: { latitude: number, longitude: number }
  ): number {
    // Implementation of the Haversine formula
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(destination.latitude - origin.latitude);
    const dLon = this.toRad(destination.longitude - origin.longitude);
    const lat1 = this.toRad(origin.latitude);
    const lat2 = this.toRad(destination.latitude);

    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * Math.PI / 180;
  }
}

// Create singleton instance
const locationService = new LocationService();
export default locationService;
