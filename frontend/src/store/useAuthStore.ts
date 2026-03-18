import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/room'
import { authService } from '../services/api/auth.service'

interface AuthState {
    user: User | null
    token: string | null
    isAuthenticated: boolean
    isLoading: boolean
    error: string | null

    // Actions
    setUser: (user: User, token: string) => void
    logout: () => void
    setError: (error: string | null) => void
    setLoading: (loading: boolean) => void
    login: (email: string, password: string) => Promise<boolean>
    register: (email: string, password: string, name: string) => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,

            setUser: (user, token) => set({
                user,
                token,
                isAuthenticated: true,
                error: null,
            }),

            logout: () => set({
                user: null,
                token: null,
                isAuthenticated: false,
            }),

            setError: (error) => set({ error }),
            setLoading: (isLoading) => set({ isLoading }),

            login: async (email, password) => {
                set({ isLoading: true, error: null });
                const response = await authService.login(email, password);
                if (response.success && response.user && response.token) {
                    set({
                        user: response.user,
                        token: response.token,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                    return true;
                } else {
                    set({ error: response.message, isLoading: false });
                    return false;
                }
            },

            register: async (email, password, name) => {
                set({ isLoading: true, error: null });
                const response = await authService.register(email, password, name);
                if (response.success && response.user && response.token) {
                    set({
                        user: response.user,
                        token: response.token,
                        isAuthenticated: true,
                        isLoading: false,
                    });
                    return true;
                } else {
                    set({ error: response.message, isLoading: false });
                    return false;
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
)
