import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the static build works from any sub-path.
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
});
