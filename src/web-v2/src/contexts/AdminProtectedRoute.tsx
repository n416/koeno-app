import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress, Container, Typography } from '@mui/material';

export const AdminProtectedRoute = () => {
  const auth = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verify = async () => {
      setIsChecking(true);
      await auth.checkAdminStatus();
      setIsChecking(false);
    };
    verify();
  }, [auth]); 

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

  if (auth.isAdmin) {
    return <Outlet />; 
  }
  
  return <Navigate to="/review/list" replace />;
};