import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    conditions: ['import', 'module', 'browser', 'default'],
  },
  server: {
    host: true,
    port: 9098,
    strictPort: true,
  },
});
