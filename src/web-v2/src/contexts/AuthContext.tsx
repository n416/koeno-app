import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// ★ KirokuListPage の sessionStorage キー
const SESSION_KEY_USER_ID = 'koeno_selected_user_id';
const SESSION_KEY_USER_NAME = 'koeno_selected_user_name';

// ★★★ 修正: 認証状態を保存するキー ★★★
const AUTH_KEY_ID = 'koeno_auth_id';
const AUTH_KEY_ADMIN = 'koeno_auth_admin';


interface AuthContextType {
  caregiverId: string | null;
  isAdmin: boolean | null; 
  login: (id: string) => Promise<boolean>; // 権限チェックの結果を返す
  logout: () => void;
  checkAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // ★★★ 修正: sessionStorage から状態を復元 ★★★
  const [caregiverId, setCaregiverId] = useState<string | null>(
    () => sessionStorage.getItem(AUTH_KEY_ID) || null
  );
  const [isAdmin, setIsAdmin] = useState<boolean | null>(
    () => {
      const adminStatus = sessionStorage.getItem(AUTH_KEY_ADMIN);
      // 'true' なら true, 'false' なら false, それ以外は null (未確認)
      return adminStatus === 'true' ? true : (adminStatus === 'false' ? false : null);
    }
  );

  /**
   * ★★★ 修正: login 関数で認証と権限チェックを両方行う ★★★
   */
  const login = async (id: string) => {
    // ログイン時に前回の選択状態をクリア
    sessionStorage.removeItem(SESSION_KEY_USER_ID);
    sessionStorage.removeItem(SESSION_KEY_USER_NAME);

    // 1. まず ID をセット
    setCaregiverId(id);
    // 2. 権限を「未確認」にリセット
    setIsAdmin(null);
    // (sessionStorage はチェック完了後にセット)

    console.log('[AuthContext] ログインIDセット. 管理者権限をチェックしています...');
    
    try {
      // 3. 引数の `id` を使って管理者APIを叩く
      const API_URL = `${API_BASE_URL}/admin/caregivers`;
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'X-Caller-ID': id, // ★ 引数の id を直接使用
        }
      });

      // (401: ヘッダー欠落, 403: 権限なし)
      if (response.status === 401 || response.status === 403) {
        console.log('[AuthContext] 判定: 一般ユーザー (40x)');
        setIsAdmin(false); // ★ state を更新
        sessionStorage.setItem(AUTH_KEY_ID, id);
        sessionStorage.setItem(AUTH_KEY_ADMIN, 'false');
        return false;
      }
      
      // (200 OK)
      if (response.ok) {
        console.log('[AuthContext] 判定: 管理者 (200 OK)');
        setIsAdmin(true); // ★ state を更新
        sessionStorage.setItem(AUTH_KEY_ID, id);
        sessionStorage.setItem(AUTH_KEY_ADMIN, 'true');
        return true;
      }

      // (500 エラーなど)
      console.error('[AuthContext] 判定エラー:', response.status);
      setIsAdmin(false);
      // (認証自体は通ったが権限チェック失敗)
      sessionStorage.setItem(AUTH_KEY_ID, id);
      sessionStorage.setItem(AUTH_KEY_ADMIN, 'false');
      return false;

    } catch (err) {
      console.error('[AuthContext] 認可チェックAPIの通信エラー:', err);
      setIsAdmin(false);
      // (認証自体は通ったが権限チェック失敗)
      sessionStorage.setItem(AUTH_KEY_ID, id);
      sessionStorage.setItem(AUTH_KEY_ADMIN, 'false');
      return false;
    }
  };


  const logout = () => {
    setCaregiverId(null);
    setIsAdmin(null);

    // ★★★ 修正: 関連する sessionStorage をすべてクリア ★★★
    sessionStorage.removeItem(AUTH_KEY_ID);
    sessionStorage.removeItem(AUTH_KEY_ADMIN);
    sessionStorage.removeItem(SESSION_KEY_USER_ID);
    sessionStorage.removeItem(SESSION_KEY_USER_NAME);
  };

  /**
   * (AdminProtectedRoute が使用する)
   */
  const checkAdminStatus = useCallback(async () => {
    if (!caregiverId) {
      setIsAdmin(false);
      return false; // ログインしていない
    }
    
    if (isAdmin !== null) {
      return isAdmin; // キャッシュを返す
    }

    console.log('[AuthContext] (checkAdminStatus) 管理者権限をチェックしています...');
    
    try {
      const API_URL = `${API_BASE_URL}/admin/caregivers`;
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'X-Caller-ID': caregiverId, 
        }
      });

      if (response.status === 401 || response.status === 403) {
        console.log('[AuthContext] 判定: 一般ユーザー (40x)');
        setIsAdmin(false);
        sessionStorage.setItem(AUTH_KEY_ADMIN, 'false'); // ★ 永続化
        return false;
      }
      
      if (response.ok) {
        console.log('[AuthContext] 判定: 管理者 (200 OK)');
        setIsAdmin(true);
        sessionStorage.setItem(AUTH_KEY_ADMIN, 'true'); // ★ 永続化
        return true;
      }

      console.error('[AuthContext] 判定エラー:', response.status);
      setIsAdmin(false);
      sessionStorage.setItem(AUTH_KEY_ADMIN, 'false'); // ★ 永続化
      return false;

    } catch (err) {
      console.error('[AuthContext] 認可チェックAPIの通信エラー:', err);
      setIsAdmin(false);
      sessionStorage.setItem(AUTH_KEY_ADMIN, 'false'); // ★ 永続化
      return false;
    }
  }, [caregiverId, isAdmin]); // (caregiverId と isAdmin のキャッシュに依存)


  return (
    <AuthContext.Provider value={{ caregiverId, isAdmin, login, logout, checkAdminStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};