import { writable, derived, type Writable, type Readable } from 'svelte/store';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Define user interface
export interface User {
  id: string;
  email: string;
  name?: string;
  [key: string]: any; // For additional user properties
}

// Define auth state interface
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

// Create auth stores with proper types
export const user: Writable<User | null> = writable(null);
export const token: Writable<string | null> = writable(null);
export const isAuthenticated: Readable<boolean> = derived(token, $token => !!$token);
export const authLoading: Writable<boolean> = writable(true);

// Initialize auth from storage
export async function initAuth(): Promise<void> {
  // Set loading state immediately
  authLoading.set(true);
  
  try {
    let storedToken: string | null = null;
    
    if (Capacitor.isNativePlatform()) {
      // Add a small delay to ensure loading screen shows
      // This prevents the flash of content
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const { value } = await Preferences.get({ key: 'auth_token' });
      storedToken = value;
      
      if (storedToken) {
        const { value: userValue } = await Preferences.get({ key: 'auth_user' });
        const userData: User | null = userValue ? JSON.parse(userValue) : null;
        user.set(userData);
      }
    } else {
      // Fallback to localStorage for web
      // Add a small delay to ensure loading screen shows
      await new Promise(resolve => setTimeout(resolve, 100));
      
      storedToken = localStorage.getItem('auth_token');
      
      if (storedToken) {
        const userData: User | null = JSON.parse(localStorage.getItem('auth_user') || 'null');
        user.set(userData);
      }
    }
    
    token.set(storedToken);
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    // Clear any potentially corrupted data
    user.set(null);
    token.set(null);
  } finally {
    // Wait a bit to complete any transitions
    await new Promise(resolve => setTimeout(resolve, 100));
    authLoading.set(false);
  }
}

// Login response interface
export interface LoginResponse {
  user: User;
  token: string;
}

// Login function - call your API here
export async function login(
  email: string, 
  password: string, 
  apiUrl: string = 'https://your-api.com/auth/login'
): Promise<LoginResponse> {
  authLoading.set(true);
  try {
    // Implement your API call to login
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }
    
    // Store the user data and token
    user.set(data.user);
    token.set(data.token);
    
    // Save to storage
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: 'auth_token', value: data.token });
      await Preferences.set({ key: 'auth_user', value: JSON.stringify(data.user) });
    } else {
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
    }
    
    return data as LoginResponse;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  } finally {
    authLoading.set(false);
  }
}

// For demo purposes - simple credential validation (REMOVE in production)
export async function mockLogin(email: string, password: string): Promise<LoginResponse> {
  authLoading.set(true);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  try {
    // Demo validation - REPLACE with real API call in production
    if (email === 'user@example.com' && password === 'password') {
      const mockToken = 'mock-jwt-token-' + Math.random().toString(36).substring(2);
      const mockUser: User = {
        id: '1',
        email,
        name: 'Demo User',
      };
      
      // Store the user data and token
      user.set(mockUser);
      token.set(mockToken);
      
      // Save to storage
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key: 'auth_token', value: mockToken });
        await Preferences.set({ key: 'auth_user', value: JSON.stringify(mockUser) });
      } else {
        localStorage.setItem('auth_token', mockToken);
        localStorage.setItem('auth_user', JSON.stringify(mockUser));
      }
      
      return { user: mockUser, token: mockToken };
    } else {
      throw new Error('Invalid email or password');
    }
  } finally {
    authLoading.set(false);
  }
}

// Logout function
export async function logout(): Promise<void> {
  // Clear auth stores
  user.set(null);
  token.set(null);
  
  // Clear storage
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: 'auth_token' });
    await Preferences.remove({ key: 'auth_user' });
  } else {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }
  
  // Optional: Call logout API endpoint
  // await fetch('https://your-api.com/auth/logout', {...});
}

// Function to get stored token (useful for API calls)
export async function getToken(): Promise<string | null> {
  let currentToken: string | null = null;
  
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: 'auth_token' });
    currentToken = value;
  } else {
    currentToken = localStorage.getItem('auth_token');
  }
  
  return currentToken;
}

// Initialize auth when this module is imported
initAuth();