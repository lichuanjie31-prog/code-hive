import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { articleAdminPlugin } from './server/article-admin-plugin.js'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'serve' ? [articleAdminPlugin({ rootDir: process.cwd(), mode: 'development' })] : [])],
  server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8000' } },
  preview: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8000' } },
}))
