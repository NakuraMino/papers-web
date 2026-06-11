import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server serves the UI on :5173 and proxies API calls to the Express
// backend on :8080. Production build goes to dist/ and is served by Express.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
