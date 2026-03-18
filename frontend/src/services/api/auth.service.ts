import axios from 'axios';
import type { User } from '../../types/room';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed',
      };
    }
  },

  async register(email: string, password: string, name: string): Promise<LoginResponse> {
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        email,
        password,
        name,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed',
      };
    }
  },

  async verify(token: string): Promise<LoginResponse> {
    try {
      const response = await axios.get(`${API_URL}/auth/verify`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        message: 'Token verification failed',
      };
    }
  },
};
