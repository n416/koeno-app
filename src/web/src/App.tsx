import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* 認証画面 */}
      <Route path="/" element={<AuthPage />} />
      
      {/* 認証が必要なページ */}
      <Route element={<ProtectedRoute />}>
        <Route path="/record" element={<RecordPage />} />
      </Route>
    </Routes>
  );
}

export default App;