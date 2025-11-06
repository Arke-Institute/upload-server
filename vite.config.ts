import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ArkeUploadClient',
      formats: ['umd'],
      fileName: () => 'browser.js',
    },
    outDir: 'dist',
    rollupOptions: {
      // Externalize deps that shouldn't be bundled
      external: [],
      output: {
        globals: {},
      },
    },
  },
});
