import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Frontend is deployed separately from the Spring Boot backend.
// Set VITE_API_BASE_URL in .env (see .env.example) to point at the backend.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'OralScreen',
        short_name: 'OralScreen',
        description: 'Oral health screening pilot',
        theme_color: '#1F6F6B',
        background_color: '#FBF8F3',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
