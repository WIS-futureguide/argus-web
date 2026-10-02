import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const argusTarget = env.VITE_ARGUS_API_TARGET || 'http://localhost:8085'
  const apolloTarget = env.VITE_APOLLO_API_TARGET || 'http://localhost:8080'
  return {
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/admin': { target: argusTarget, changeOrigin: true },
      '/payments': { target: argusTarget, changeOrigin: true },
      '/auth': { target: apolloTarget, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
  },
  }
})
