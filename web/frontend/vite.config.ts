import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 生产由 nginx 同源提供前端 + /api 反代；dev 用 proxy 指向后端
// 默认本地后端；API_PROXY=https://dogfever.cn npm run dev 可直接代理到线上
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: process.env.API_PROXY || 'http://127.0.0.1:5002', changeOrigin: true },
    },
  },
})
