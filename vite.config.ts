import { defineConfig } from 'vite';

const isEhpkBuild = process.env.EVENHUB_BUILD === '1';

export default defineConfig({
  base: isEhpkBuild ? './' : '/Even-realities-Lyrics/',
  root: '.',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: isEhpkBuild ? '' : 'assets',
  },
});
