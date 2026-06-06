import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@homemed/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
  server: { port: 5173, host: '0.0.0.0' },
  base: '/liff',
});
