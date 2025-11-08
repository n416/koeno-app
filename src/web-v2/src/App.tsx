import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

import { KioskAuthPage } from './pages/KioskAuthPage';
import { ReviewDashboardPage } from './pages/ReviewDashboardPage';
import { ReviewDetailPage } from './pages/ReviewDetailPage';

// ★★★ Task 1.3: 新しいID管理ページをインポート ★★★
import { AdminUsersPage } from './pages/AdminUsersPage'; 

function App() {
  return (
    <Routes>
      {/* --- Task 2/3: PWA (スマホ録音) 画面 --- */}
      <Route path="/" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/record" element={<RecordPage />} />
      </Route>
      
      {/* --- Task 6: PC版レビュー画面 --- */}
      
      {/* PC版NFC認証 */}
      <Route path="/review" element={<KioskAuthPage />} />
      
      {/* PC版も AuthContext/ProtectedRoute を流用する */}
      <Route element={<ProtectedRoute />}>
        {/* 記録一覧 */}
        <Route path="/review/dashboard" element={<ReviewDashboardPage />} />
        
        {/* 記録詳細 */}
        <Route path="/review/detail/:id" element={<ReviewDetailPage />} />

        {/* ★★★ Task 1.3: ID管理ページへのルートを有効化 ★★★ */}
        <Route path="/review/admin/users" element={<AdminUsersPage />} />

      </Route>
      
    </Routes>
  );
}

export default App;