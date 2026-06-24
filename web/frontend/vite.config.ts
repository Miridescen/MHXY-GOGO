import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 生产由 nginx 在 :8090 同源提供前端 + /api 反代；dev 用 proxy 指向本地后端
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:5002', changeOrigin: true },
    },
  },
})
