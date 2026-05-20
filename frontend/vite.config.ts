/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
    },
    server: {
        host: '0.0.0.0',
        port: 3000,
        proxy: {
            '/api': {
                target: `http://localhost:${process.env.VITE_API_PORT || '9090'}`,
                changeOrigin: true,
            },
            '/ws': {
                target: `ws://localhost:${process.env.VITE_WS_PORT || '8081'}`,
                ws: true,
            },
        },
    },
})
