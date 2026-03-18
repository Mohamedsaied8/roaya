import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/room'

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
