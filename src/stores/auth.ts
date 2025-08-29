import { atom } from 'nanostores';
import type { User } from '../utils/api';
import api from '../utils/api';

export const $user = atom<User | null>(null);
export const $isAuthenticated = atom<boolean>(false);
export const $isLoading = atom<boolean>(true);

// Initialize auth state
export async function initAuth() {
  if (typeof window === 'undefined') {
    $isLoading.set(false);
    return;
  }
  
  const token = localStorage.getItem('token');
  if (!token) {
    $isLoading.set(false);
    return;
  }

  api.setToken(token);
  
  try {
    const response = await api.getCurrentUser();
    if (response.success && response.data) {
      $user.set(response.data.user);
      $isAuthenticated.set(true);
    } else {
      // Invalid token
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
      api.setToken(null);
    }
  } catch (error) {
    console.error('Failed to initialize auth:', error);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    api.setToken(null);
  } finally {
    $isLoading.set(false);
  }
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.login(email, password);
    
    if (response.success && response.data) {
      api.setToken(response.data.token);
      $user.set(response.data.user);
      $isAuthenticated.set(true);
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Login failed' };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Login failed' 
    };
  }
}

export async function register(userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  favoriteTeamId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.register(userData);
    
    if (response.success && response.data) {
      api.setToken(response.data.token);
      $user.set(response.data.user);
      $isAuthenticated.set(true);
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Registration failed' };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Registration failed' 
    };
  }
}

export async function registerWithInvite(userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  favoriteTeamId?: string;
  inviteToken: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.registerWithInvite(userData);
    
    if (response.success && response.data) {
      api.setToken(response.data.token);
      $user.set(response.data.user);
      $isAuthenticated.set(true);
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Registration failed' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed'
    };
  }
}

export async function forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.forgotPassword(email);
    
    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Failed to send reset email' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send reset email'
    };
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.resetPassword(token, newPassword);
    
    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Failed to reset password' };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset password'
    };
  }
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    window.location.href = '/';
  }
  api.setToken(null);
  $user.set(null);
  $isAuthenticated.set(false);
}