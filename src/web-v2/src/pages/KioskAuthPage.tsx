import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ★★★ Task 2.2: MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Typography,
  Alert,
  CircularProgress
} from '@mui/material';
import { Nfc as NfcIcon } from '@mui/icons-material'; // アイコン

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// ★ 修正: 相対パス (プロキシ 経由) にする
const AUTH_URL = `${API_BASE_URL}/authenticate`; // -> /api/authenticate

/**
 * Task 6.1 (Task 7.4 修正): PC版 認証ページ (KioskAuthPage)
 * Task 2.2: MUI化
 */
export const KioskAuthPage = () => {
  const [inputBuffer, setInputBuffer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false); // ★ 認証中ローディング
  const auth = useAuth();
  const navigate = useNavigate();
  
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const focusInput = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  useEffect(() => {
    focusInput();
  }, []);

  /**
   * 認証APIをコールするロジック (Task 7.4)
   */
  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enterキーが押された場合のみ処理
    if (e.key === 'Enter') {
      const trimmedId = inputBuffer.trim();
      
      if (trimmedId.length > 0) {
        
        // ★ API認証処理
        setLoading(true);
        setError('認証中...');
        
        // (AUTH_URL が /api/authenticate になっている)
        try {
          const response = await fetch(AUTH_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ caregiver_id: trimmedId })
          });

          if (response.ok) {
            // ★ API認証成功
            console.log(`[KioskAuth] 認証成功: ${trimmedId}`);
            setError('');
            auth.login(trimmedId); // 認証が通ったのでグローバル状態にセット
            navigate('/review/dashboard'); // ダッシュボードへ
          } else {
            // ★ API認証失敗 (401 Unauthorized など)
            const errMsg = await response.text();
            setError(errMsg || '認証に失敗しました。IDが正しくありません。');
            setInputBuffer(''); // バッファをクリア
          }
          
        } catch (err) {
          // (Failed to fetch など、サーバーが落ちている場合)
          console.error('認証APIエラー:', err);
          if (err instanceof Error) {
            setError(`エラー: 認証サーバーに接続できません: ${err.message}`);
          } else {
            setError('エラー: 認証サーバーに接続できません。');
          }
          setInputBuffer(''); // バッファをクリア
        }
        
        setLoading(false);
        
      } else {
        setError('IDが入力されていません');
        setInputBuffer(''); // バッファをクリア
      }
    }
  };
  
  // Inputの値が変更されたときのハンドラ (手入力 ＆ NFCリーダー入力)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setInputBuffer(e.target.value);
  };

  return (
    // ★★★ Task 2.2: MUI化 ★★★
    <Container 
      maxWidth="sm" 
      onClick={focusInput} // 画面クリックで常に入力欄にフォーカス
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

        <input
          ref={hiddenInputRef}
          type="text" // (passwordにするとNFCリーダーの入力が見えないためtext)
          value={inputBuffer}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={focusInput} // フォーカスが外れても即座にフォーカスし直す
          autoFocus
          disabled={loading} // ★ 認証中は入力を無効化
          style={{
            // 隠しinput (MUI化対象外)
            position: 'absolute',
            opacity: 0,
            top: '-1000px',
          }}
        />
        
        {/* --- ローディング・エラー表示 --- */}
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