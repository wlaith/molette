import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Library build: ESM + CJS, React left to the app.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es', 'cjs'], fileName: (f) => (f === 'es' ? 'index.js' : 'index.cjs') },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      // Components use hooks: mark the bundle as client code for React Server Components (Next.js App Router).
      output: { banner: "'use client';" },
    },
  },
  test: { environment: 'jsdom', globals: true },
});
