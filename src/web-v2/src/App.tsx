import { useState, useMemo, useEffect, useCallback } from 'react';
import { Routes, Route, useLocation, Link as RouterLink, useNavigate } from 'react-router-dom'; 
import { AuthPage } from './pages/AuthPage';
import { RecordPage } from './pages/RecordPage';
import { ProtectedRoute } from './components/ProtectedRoute';

import { KioskAuthPage } from './pages/KioskAuthPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminProtectedRoute } from './components/AdminProtectedRoute';
import { KioskProtectedRoute } from './components/KioskProtectedRoute';

// v2.1 新UIコンポーネント
import KirokuListPage from './pages/KirokuListPage';
import KirokuDetailPage from './pages/KirokuDetailPage';
import KirokuAdjustPage from './pages/KirokuAdjustPage';
import { StaffInputPage } from './pages/StaffInputPage'; // ★ 追加

// v2.1 Gemini API対応
import { SettingsModal } from './components/SettingsModal';
import { GeminiApiClient, type ApiModel } from './lib/geminiApiClient';

// テーマ・MUI
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaQuery from '@mui/material/useMediaQuery';
import { lightTheme, darkTheme } from './theme';
import { AppBar, Toolbar, Typography, IconButton, Button } from '@mui/material'; 
import SettingsIcon from '@mui/icons-material/Settings';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from './contexts/AuthContext'; 

/**
 * [v2.2] App.tsx
 * - 現場向け画面 (StaffInputPage) を追加
 */
function App() {
  const location = useLocation();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = useMemo(
    () => (prefersDarkMode ? darkTheme : lightTheme),
    [prefersDarkMode],
  );

  const auth = useAuth();
  const navigate = useNavigate();

  // --- v2.1 APIキーモーダル用 State ---
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [modelId, setModelId] = useState(() => localStorage.getItem('geminiModelId') || '');
  const [models, setModels] = useState<ApiModel[]>([]);
  const [testStatus, setTestStatus] = useState('未テスト');

  // APIキーの初期ロード (接続テスト)
  useEffect(() => {
    const key = localStorage.getItem('geminiApiKey');
    const noApiMode = localStorage.getItem('noApiMode') === 'true';
    if (key && !noApiMode) {
      handleTestConnection(key);
    }
  }, []); 

  const handleTestConnection = useCallback(async (keyToTest: string) => {
    setTestStatus('テスト中...');
    try {
      const availableModels = await GeminiApiClient.listAvailableModels(keyToTest);
      setModels(availableModels);
      
      const savedModel = localStorage.getItem('geminiModelId');
      if (savedModel && availableModels.some(m => m.id === savedModel)) {
        setModelId(savedModel);
      } else if (availableModels.length > 0) {
        setModelId(availableModels[0].id);
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
    
    const noApiMode = localStorage.getItem('noApiMode') === 'true';
    if (!noApiMode) {
        handleTestConnection(apiKey);
    }
  };

  // PCレビュー画面 (/review) でのみヘッダーを表示
  const showPcHeader = location.pathname.startsWith('/review') && auth.caregiverId;

  const handleLogout = () => {
    auth.logout();
    navigate('/review'); // Kiosk ログイン画面に戻る
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> 
      
      {showPcHeader && (
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              KOENO-APP (v2.2) レビュー
            </Typography>

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
            
            <IconButton color="inherit" onClick={handleLogout} title="ログアウト">
              <LogoutIcon />
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
        {/* --- PWA (スマホ録音) 画面 --- */}
        <Route path="/" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/record" element={<RecordPage />} />
        </Route>
        
        {/* --- PC版レビュー画面 --- */}
        <Route path="/review" element={<KioskAuthPage />} />
        
        <Route element={<KioskProtectedRoute />}>
          {/* ★★★ v2.2 現場用トップ画面 (デフォルト遷移先) ★★★ */}
          <Route path="/review/staff" element={<StaffInputPage />} />

          {/* 管理・詳細画面 */}
          <Route path="/review/list" element={<KirokuListPage />} />
          <Route path="/review/detail/:userId/:date" element={<KirokuDetailPage />} />
          <Route path="/review/adjust/:recordingId" element={<KirokuAdjustPage />} />

          {/* 管理者用 */}
          <Route element={<AdminProtectedRoute />}>
            <Route path="/review/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
        
      </Routes>
    </ThemeProvider>
  );
}

export default App;