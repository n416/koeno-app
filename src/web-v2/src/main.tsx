import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // ★ 追加
import { AuthProvider } from './contexts/AuthContext'; // ★ 追加
import App from './App';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// (SW登録コードは変更なし)
console.log('[APP] registerSW を呼び出します...');
registerSW({
  immediate: true,
  onRegistered(registration) {
    console.log(`[APP] Service Worker が正常に登録されました。スコープ: ${registration.scope}`);
  },
  onRegisterError(error) {
    console.error('[APP] Service Worker の登録に失敗しました:', error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ★ アプリ全体をラップする ★ */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);