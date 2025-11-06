import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

export const ProtectedRoute = () => {
  const auth = useAuth();

  if (!auth.caregiverId) {
    // Task 2.4: セッションが開始されていない場合は認証画面 (/) へ
    return <Navigate to="/" replace />;
  }

  // 認証されていれば子ルート (RecordPage など) を表示
  return <Outlet />;
};