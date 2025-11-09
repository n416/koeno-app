import React, { useState, useMemo, useEffect, useCallback } from 'react';
// ★★★ 修正: Link (RouterLink) と Button をインポート ★★★
import { Routes, Route, useLocation, Link as RouterLink } from 'react-router-dom'; 
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

import { KioskAuthPage } from './pages/KioskAuthPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { KioskProtectedRoute } from './components/KioskProtectedRoute';

// ★★★ v2.1 新UIコンポーネント ★★★
import KirokuListPage from './pages/KirokuListPage'; //
import KirokuDetailPage from './pages/KirokuDetailPage'; //
import KirokuAdjustPage from './pages/KirokuAdjustPage'; //

// ★★★ v2.1 Gemini API対応 ★★★
import { SettingsModal } from './components/SettingsModal'; //
import { GeminiApiClient, type ApiModel } from './lib/geminiApiClient'; //

// ★★★ テーマ・MUI ★★★
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { lightTheme, darkTheme } from './theme';
// ★★★ 修正: Button をインポート ★★★
import { AppBar, Toolbar, Typography, IconButton, Button } from '@mui/material'; 
import SettingsIcon from '@mui/icons-material/Settings';
// ★★★ 修正: 管理者アイコンをインポート ★★★
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
// ★★★ 修正: AuthContext をインポート ★★★
import { useAuth } from './contexts/AuthContext'; 


/**
 * [v2.1] App.tsx 最終版
 * - 旧UIを削除
 * - 新UI (A,B,C) をルーティング
 * - APIキーモーダルを実装
 */
function App() {
  const location = useLocation(); // ★ 現在のパスを取得
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(
    () => (prefersDarkMode ? darkTheme : lightTheme),
    [prefersDarkMode],
  );

  // ★★★ 修正: auth コンテキストを取得 ★★★
  const auth = useAuth();

  // --- v2.1 APIキーモーダル用 State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [modelId, setModelId] = useState(() => localStorage.getItem('geminiModelId') || '');
  const [models, setModels] = useState<ApiModel[]>([]);
  const [testStatus, setTestStatus] = useState('未テスト');

  // APIキーの初期ロード
  useEffect(() => {
    const key = localStorage.getItem('geminiApiKey');
    if (key) {
      handleTestConnection(key);
    }
  }, []); // ★ 依存配列から handleTestConnection を削除 (useCallbackしていないため)

  const handleTestConnection = useCallback(async (keyToTest: string) => {
    setTestStatus('テスト中...');
    try {
      const availableModels = await GeminiApiClient.listAvailableModels(keyToTest);
      setModels(availableModels);
      
      const savedModel = localStorage.getItem('geminiModelId');
      if (savedModel && availableModels.some(m => m.id === savedModel)) {
        setModelId(savedModel);
      } else if (availableModels.length > 0) {
        setModelId(availableModels[0].id); // デフォルトを設定
      }
      setTestStatus(`成功: ${availableModels.length} モデル取得`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '不明なエラー';
      setTestStatus(`失敗: ${message}`);
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('geminiApiKey', apiKey);
    localStorage.setItem('geminiModelId', modelId);
    setIsSettingsOpen(false);
    handleTestConnection(apiKey); // 保存と同時に接続テスト
  };

  // ★ v2.1 PCレビュー画面 (/review) でのみヘッダーを表示
  const showPcHeader = location.pathname.startsWith('/review');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> 
      
      {showPcHeader && (
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              KOENO-APP (v2.1) レビュー
            </Typography>

            {/* ★★★ 修正: 管理者(isAdmin === true)の場合のみ表示 ★★★ */}
            {auth.isAdmin === true && (
              <Button
                color="inherit"
                component={RouterLink}
                to="/review/admin/users"
                startIcon={<AdminPanelSettingsIcon />}
              >
                ユーザー管理
              </Button>
            )}

            <IconButton color="inherit" onClick={() => setIsSettingsOpen(true)} title="Gemini APIキー設定">
              <SettingsIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKeyInput={apiKey}
        onApiKeyInputChange={setApiKey}
        availableModels={models}
        selectedModel={modelId}
        onSelectedModelChange={setModelId}
        onSave={handleSaveSettings}
        onTestConnection={() => handleTestConnection(apiKey)}
        testStatus={testStatus}
      />

      <Routes>
        {/* --- PWA (スマホ録音) 画面 (変更なし) --- */}
        <Route path="/" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/record" element={<RecordPage />} />
        </Route>
        
        {/* --- PC版レビュー画面 (v2.1) --- */}
        <Route path="/review" element={<KioskAuthPage />} />
        
        <Route element={<KioskProtectedRoute />}>
          {/* ★★★ v2.1 新ルーティング ★★★ */}
          <Route path="/review/list" element={<KirokuListPage />} />
          <Route path="/review/detail/:userId/:date" element={<KirokuDetailPage />} />
          <Route path="/review/adjust/:recordingId" element={<KirokuAdjustPage />} />

          {/* 管理者用 (変更なし) */}
          <Route element={<AdminProtectedRoute />}>
            <Route path="/review/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
        
      </Routes>
    </ThemeProvider>
  );
}

export default App;