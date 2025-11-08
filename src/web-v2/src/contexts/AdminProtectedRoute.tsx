import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress, Container, Typography } from '@mui/material';

/**
 * [Task 9.2] 管理者専用の保護ルート
 * * 1. `checkAdminStatus()` を呼び出し、権限を確認
 * 2. 確認中: ローディング表示
 * 3. true: 子ルート (<Outlet />) を表示
 * 4. false: ダッシュボード (/review/dashboard) にリダイレクト
 */
export const AdminProtectedRoute = () => {
  const auth = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // (コンポーネントのマウント時に権限チェックを実行)
    const verify = async () => {
      setIsChecking(true);
      await auth.checkAdminStatus();
      setIsChecking(false);
    };
    verify();
  }, [auth]); // (auth.checkAdminStatus が useCallback されているため)

  // 1. 確認中
  if (isChecking || auth.isAdmin === null) {
    return (
      <Container maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>管理者権限を確認しています...</Typography>
        </Box>
      </Container>
    );
  }

  // 3. 権限あり
  if (auth.isAdmin) {
    return <Outlet />; // AdminUsersPage などを表示
  }
  
  // 4. 権限なし
  return <Navigate to="/review/dashboard" replace />;
};