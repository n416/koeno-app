/// <reference types="vite-plugin-pwa/info" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev.config/
export default defineConfig({
  
  server: {
    host: true, // ネットワークIPを許可 (Caddyが 5173 にアクセスするため必須)
    
    // ★★★ allowedHosts はCaddyからのアクセス(192.168.0.16)を許可するため、
    // host: true でカバーされるか、明示的に 192.168.0.16 が必要かもしれませんが、
    // ひとまず ngrok 用の設定は削除します。
    allowedHosts: [
      '192.168.0.16', // Caddyからのアクセスを許可
      '.ngrok-free.dev', // ngrokのドメインを許可
      '.ngrok-free.app'  // (念のためこちらも許可)
    ],
    
  },
    
  plugins: [
    react(),
    VitePWA({
      strategy: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts', // (sw.ts の if (!import.meta.env.DEV) は元に戻してください)
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