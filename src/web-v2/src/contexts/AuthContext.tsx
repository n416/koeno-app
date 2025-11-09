import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface AuthContextType {
  caregiverId: string | null;
  // ★★★ Task 9.2: isAdmin ステートを追加 (null: 未確認, true: 管理者, false: 一般)
  isAdmin: boolean | null; 
  // ★★★ 修正: login を async に変更し、権限チェックを内包する ★★★
  login: (id: string) => Promise<boolean>; // 権限チェックの結果を返す
  logout: () => void;
  // ★★★ Task 9.2: 認可チェック関数を追加 ★★★
  checkAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [caregiverId, setCaregiverId] = useState<string | null>(null);
  // ★★★ Task 9.2: isAdmin ステート (null: 未確認)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  /**
   * ★★★ 修正: login 関数で認証と権限チェックを両方行う ★★★
   */
  const login = async (id: string) => {
    // 1. まず ID をセット
    setCaregiverId(id);
    // 2. 権限を「未確認」にリセット
    setIsAdmin(null);

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
        return false;
      }
      
      // (200 OK)
      if (response.ok) {
        console.log('[AuthContext] 判定: 管理者 (200 OK)');
        setIsAdmin(true); // ★ state を更新
        return true;
      }

      // (500 エラーなど)
      console.error('[AuthContext] 判定エラー:', response.status);
      setIsAdmin(false);
      return false;

    } catch (err) {
      console.error('[AuthContext] 認可チェックAPIの通信エラー:', err);
      setIsAdmin(false);
      return false;
    }
  };


  const logout = () => {
    setCaregiverId(null);
    // ★★★ Task 9.2: ログアウト時もリセット
    setIsAdmin(null);
  };

  /**
   * ★★★ Task 9.2: 管理者ステータスをチェックする関数 ★★★
   * (AdminProtectedRoute が使用するため、この関数は残す)
   */
  const checkAdminStatus = useCallback(async () => {
    if (!caregiverId) {
      setIsAdmin(false);
      return false; // ログインしていない
    }
    
    // (すでにチェック済みの場合はキャッシュを返す)
    if (isAdmin !== null) {
      return isAdmin;
    }

    console.log('[AuthContext] (checkAdminStatus) 管理者権限をチェックしています...');
    
    try {
      const API_URL = `${API_BASE_URL}/admin/caregivers`;
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'X-Caller-ID': caregiverId, // (Task 8 で実装したヘッダー)
        }
      });

      // (401: ヘッダー欠落, 403: 権限なし)
      if (response.status === 401 || response.status === 403) {
        console.log('[AuthContext] 判定: 一般ユーザー (40x)');
        setIsAdmin(false);
        return false;
      }
      
      // (200 OK)
      if (response.ok) {
        console.log('[AuthContext] 判定: 管理者 (200 OK)');
        setIsAdmin(true);
        return true;
      }

      // (500 エラーなど)
      console.error('[AuthContext] 判定エラー:', response.status);
      setIsAdmin(false);
      return false;

    } catch (err) {
      console.error('[AuthContext] 認可チェックAPIの通信エラー:', err);
      setIsAdmin(false);
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