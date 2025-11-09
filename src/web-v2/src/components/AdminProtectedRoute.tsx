import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress, Container, Typography } from '@mui/material';

/**
 * [Task 9.2] 管理者専用の保護ルート
 * 1. `checkAdminStatus()` を呼び出し、権限を確認
 * 2. 確認中: ローディング表示
 * 3. true: 子ルート (<Outlet />) を表示
 * 4. false: 新リスト画面 (/review/list) にリダイレクト (v2.1)
 */
export const AdminProtectedRoute = () => {
  const auth = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // (コンポーネントのマウント時に権限チェックを実行)
    const verify = async () => {
      setIsChecking(true);
      // (checkAdminStatus は AuthContext 側で結果をキャッシュする)
      await auth.checkAdminStatus();
      setIsChecking(false);
    };
    verify();
  }, [auth]); // (auth.checkAdminStatus が useCallback されているため)

  // 1. 確認中 (auth.isAdmin === null は「未確認」状態)
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

  // 3. 権限あり (auth.isAdmin === true)
  if (auth.isAdmin) {
    return <Outlet />; // AdminUsersPage などを表示
  }
  
  // 4. 権限なし (auth.isAdmin === false)
  // ★★★ v2.1 修正 ★★★
  // リダイレクト先を /review/dashboard から /review/list に変更
  return <Navigate to="/review/list" replace />;
}; // ★★★ 終端の }; を確認してください ★★★