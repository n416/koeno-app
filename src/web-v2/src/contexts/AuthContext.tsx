import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface AuthContextType {
  caregiverId: string | null;
  // ★★★ Task 9.2: isAdmin ステートを追加 (null: 未確認, true: 管理者, false: 一般)
  isAdmin: boolean | null; 
  login: (id: string) => void;
  logout: () => void;
  // ★★★ Task 9.2: 認可チェック関数を追加 ★★★
  checkAdminStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [caregiverId, setCaregiverId] = useState<string | null>(null);
  // ★★★ Task 9.2: isAdmin ステート (null: 未確認)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const login = (id: string) => {
    setCaregiverId(id);
    // ★★★ Task 9.2: ログイン時は isAdmin ステータスをリセット
    setIsAdmin(null);
  };

  const logout = () => {
    setCaregiverId(null);
    // ★★★ Task 9.2: ログアウト時もリセット
    setIsAdmin(null);
  };

  /**
   * ★★★ Task 9.2: 管理者ステータスをチェックする関数 ★★★
   * (PO 1.3 の指示に基づき、/admin/caregivers へのテストアクセスで判定)
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

    console.log('[AuthContext] 管理者権限をチェックしています...');
    
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