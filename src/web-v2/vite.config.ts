/// <reference types="vite-plugin-pwa/info" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    host: true,
    allowedHosts: [
      '192.168.0.16',
      '.ngrok-free.dev',
      '.ngrok-free.app'
    ],
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest', // ★ここを修正 (strategy -> strategies)
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: null,
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'KOENO-APP (Offline)',
        short_name: 'KOENO',
        description: 'オフライン対応 録音アプリ',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    })
  ],
})