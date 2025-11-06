// src/web/vite.config.ts (修正版)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
// import { VitePWA } from 'vite-plugin-pwa'; // 削除

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // ★★★ PWAプラグインのセクションをすべて削除 ★★★
  ],
});