import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// ★★★ Task 9.1 (GM指示): ThemeProvider と CssBaseline は App.tsx に移動 ★★★
// (ここでは import も削除)

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
    {/* ★★★ ThemeProvider/CssBaseline は App.tsx に移動 ★★★ */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);