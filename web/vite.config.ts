import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Shadoken web client — Vite + PWA configuration.
// The dev server proxies nothing; the Colyseus multiplayer server runs
// independently (see /server) and is reached via VITE_MULTIPLAYER_URL.
export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    cssMinify: 'esbuild',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && id.includes('phaser')) return 'phaser';
          if (id.includes('node_modules') && id.includes('colyseus')) return 'colyseus';
          return undefined;
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'logo.png',
        'favicon.png',
        'audio/*.ogg',
      ],
      manifest: false, // we ship our own public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ogg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Never cache the multiplayer websocket or wallet RPC calls.
        navigateFallbackDenylist: [/^\/api/, /^\/matchmake/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'shadoken-images' },
          },
          {
            urlPattern: ({ request }) => request.destination === 'audio',
            handler: 'CacheFirst',
            options: {
              cacheName: 'shadoken-audio',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
