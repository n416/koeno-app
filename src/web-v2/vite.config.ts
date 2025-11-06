import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategy: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: null, 
      
      devOptions: {
        enabled: true,
      },

      // ★★★ manifest.json の定義を追加 ★★★
      manifest: {
        name: 'KOENO-APP (Offline)',
        short_name: 'KOENO',
        description: 'オフライン対応 録音アプリ',
        theme_color: '#ffffff',
        // icons: [
        //   { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        //   { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        // ],
      },
      // ★★★ ここまで ★★★
    })
  ],
})