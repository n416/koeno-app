import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  caregiverId: string | null;
  login: (id: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [caregiverId, setCaregiverId] = useState<string | null>(null);

  const login = (id: string) => {
    setCaregiverId(id);
    // (将来的にセッションストレージ等に保存)
  };

  const logout = () => {
    setCaregiverId(null);
  };

  return (
    <AuthContext.Provider value={{ caregiverId, login, logout }}>
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