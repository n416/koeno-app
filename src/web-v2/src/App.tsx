import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

import { KioskAuthPage } from './pages/KioskAuthPage';
import { ReviewDashboardPage } from './pages/ReviewDashboardPage';
import { ReviewDetailPage } from './pages/ReviewDetailPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';

// ★★★ Task 9.1 (GM指示): テーマと動的切り替えフックをインポート ★★★
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { lightTheme, darkTheme } from './theme'; // (theme.ts から両方インポート)

function App() {
  // ★★★ Task 9.1 (GM指示): OSのダークモード設定を検知 ★★★
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = React.useMemo(
    () => (prefersDarkMode ? darkTheme : lightTheme),
    [prefersDarkMode],
  );

  return (
    // ★★★ Task 9.1 (GM指示): 動的テーマを適用 ★★★
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* CSSリセット */}
      <Routes>
        {/* --- Task 2/3: PWA (スマホ録音) 画面 --- */}
        <Route path="/" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/record" element={<RecordPage />} />
        </Route>
        
        {/* --- Task 6: PC版レビュー画面 --- */}
        
        {/* PC版NFC認証 */}
        <Route path="/review" element={<KioskAuthPage />} />
        
        {/* PC版 (ログイン済み) */}
        <Route element={<ProtectedRoute />}>
          {/* 記録一覧 */}
          <Route path="/review/dashboard" element={<ReviewDashboardPage />} />
          
          {/* 記録詳細 */}
          <Route path="/review/detail/:id" element={<ReviewDetailPage />} />

          {/* ★★★ Task 9.2: ID管理ページを AdminProtectedRoute で保護 ★★★ */}
          <Route element={<AdminProtectedRoute />}>
            <Route path="/review/admin/users" element={<AdminUsersPage />} />
          </Route>

        </Route>
        
      </Routes>
    </ThemeProvider>
  );
}

export default App;