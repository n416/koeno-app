import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// MUIコンポーネント
import {
  Container,
  Box,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import { Nfc as NfcIcon } from '@mui/icons-material';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AUTH_URL = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) + '/authenticate';

/**
 * PC版 認証ページ (KioskAuthPage)
 */
export const KioskAuthPage = () => {
  const [inputBuffer, setInputBuffer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  
  // input要素への参照
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const focusInput = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  useEffect(() => {
    focusInput();
  }, []);

  const attemptLogin = async (id: string) => {
    if (id.length === 0) {
      setError('IDが入力されていません');
      return;
    }
    
    setLoading(true);
    setError('認証中...');

    try {
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caregiver_id: id })
      });

      if (response.ok) {
        console.log(`[KioskAuth] 認証成功: ${id}`);
        setError('');
        
        await auth.login(id); 
        
        // ★ 遷移先を現場用画面に変更
        navigate('/review/staff'); 
        
      } else {
        const errMsg = await response.text();
        setError(errMsg || '認証に失敗しました。IDが正しくありません。');
        setInputBuffer('');
      }
      
    } catch (err) {
      console.error('認証APIエラー:', err);
      if (err instanceof Error) {
        setError(`エラー: 認証サーバーに接続できません: ${err.message}`);
      } else {
        setError('エラー: 認証サーバーに接続できません。');
      }
      setInputBuffer('');
    }
    
    setLoading(false);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmedId = inputBuffer.trim();
      await attemptLogin(trimmedId);
    }
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setInputBuffer(e.target.value);
  };

  return (
    <Container 
      maxWidth="sm" 
      onClick={focusInput}
      sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        alignItems: 'center',
        textAlign: 'center'
      }}
    >
      <Box>
        <Typography variant="h4" component="h1" gutterBottom>
          KOENO-APP レビュー
        </Typography>
        
        <NfcIcon sx={{ fontSize: 60, color: 'text.secondary' }} />

        <Typography variant="h6" sx={{ mt: 2 }}>
          USB-NFCリーダーをかざしてください
        </Typography>
        <Typography variant="body1" color="text.secondary">
          （またはIDを手入力してEnterキーを押してください）
        </Typography>

        {/* ★ 修正: MUIのBoxをinputタグとしてレンダリング 
          - sxプロパティでスタイル定義 (no-inline-styles 対応)
          - aria-label でラベル付与 (axe/forms 対応)
        */}
        <Box
          component="input"
          ref={hiddenInputRef}
          type="text" // passwordではなくtext (リーダー入力確認用)
          value={inputBuffer}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={focusInput}
          autoFocus
          disabled={loading}
          aria-label="NFCリーダー入力用" // ★ アクセシビリティ対応
          sx={{
            position: 'absolute',
            opacity: 0,
            top: '-1000px',
            pointerEvents: 'none' // マウス操作を透過させる
          }}
        />
        
        {loading && (
          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={24} />
            <Typography>{error || '認証中...'}</Typography>
          </Box>
        )}
        
        {!loading && error && (
          <Alert severity="error" sx={{ mt: 3, width: '100%' }}>
            {error}
          </Alert>
        )}
      </Box>
    </Container>
  );
};