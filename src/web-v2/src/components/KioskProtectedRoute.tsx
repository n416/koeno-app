import { useAuth } from '../contexts/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

/**
 * [GM 指摘修正] PC版（Kiosk/Review）専用の保護ルート
 * 認証が切れた場合、PWA(/) ではなく Kiosk認証(/review) に戻す
 */
export const KioskProtectedRoute = () => {
  const auth = useAuth();

  if (!auth.caregiverId) {
    // ★★★ 修正点 ★★★
    // リダイレクト先を KioskAuthPage (/) から KioskAuthPage (/review) に変更
    return <Navigate to="/review" replace />;
  }

  // 認証されていれば子ルート (ReviewDashboardPage など) を表示
  return <Outlet />;
};