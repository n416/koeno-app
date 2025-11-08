import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';

import { registerSW } from 'virtual:pwa-register';

// ★★★ Task 2.1: MUIのテーマとベースラインをインポート ★★★
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// ★★★ Task 2.1: ダークテーマを定義 ★★★
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

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
    {/* ★★★ Task 2.1: アプリ全体をラップする ★★★ */}
    <ThemeProvider theme={darkTheme}>
      <CssBaseline /> {/* CSSリセット */}
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);