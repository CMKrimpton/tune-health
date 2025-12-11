import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        article: resolve(__dirname, 'articles/mirtazapine-guide.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    host: true
  }
})
