import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

// ★★★ Task 6: PC版レビュー画面のコンポーネントをインポート (名称変更) ★★★
// import { AdminAuthPage } from './pages/AdminAuthPage'; // (変更前)
import { KioskAuthPage } from './pages/KioskAuthPage'; // ★ 変更後
import { ReviewDashboardPage } from './pages/ReviewDashboardPage';
import { ReviewDetailPage } from './pages/ReviewDetailPage';

function App() {
  return (
    <Routes>
      {/* --- Task 2/3: PWA (スマホ録音) 画面 --- */}
      <Route path="/" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/record" element={<RecordPage />} />
      </Route>
      
      {/* ★★★ Task 6: PC版レビュー画面 (名称変更) ★★★ */}
      
      {/* PC版NFC認証 (Task 6.1) */}
      {/* <Route path="/review" element={<AdminAuthPage />} /> */} {/* (変更前) */}
      <Route path="/review" element={<KioskAuthPage />} /> {/* ★ 変更後 */}
      
      {/* PC版も AuthContext/ProtectedRoute を流用する */}
      <Route element={<ProtectedRoute />}>
        {/* 記録一覧 (Task 6.2) */}
        <Route path="/review/dashboard" element={<ReviewDashboardPage />} />
        
        {/* 記録詳細 (Task 6.3) */}
        <Route path="/review/detail/:id" element={<ReviewDetailPage />} />
      </Route>
      
    </Routes>
  );
}

export default App;