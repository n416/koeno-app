import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// MUIコンポーネント
import {
  Container,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Button
} from '@mui/material';
import { Nfc as NfcIcon, QrCodeScanner as QrIcon } from '@mui/icons-material';

// QRスキャナー
import { QRScannerModal } from '../components/QRScannerModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AUTH_URL = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) + '/authenticate';
const AUTH_QR_URL = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) + '/authenticate_qr';

/**
 * PC版 認証ページ (KioskAuthPage)
 */
export const KioskAuthPage = () => {
  const [inputBuffer, setInputBuffer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false); // QRモーダル開閉

  const auth = useAuth();
  const navigate = useNavigate();
  
  // input要素への参照（NFCリーダー用）
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const focusInput = () => {
    // QRモーダルが開いていないときだけフォーカスする
    if (hiddenInputRef.current && !isQrOpen) {
      hiddenInputRef.current.focus();
    }
  };

  useEffect(() => {
    focusInput();
  }, [isQrOpen]); // モーダルが閉じたら再フォーカス

  // 通常認証 (ID入力/NFC)
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

  // QR認証処理
  const handleQrScan = async (token: string) => {
    setIsQrOpen(false); // スキャン成功したらモーダルを閉じる
    setLoading(true);
    setError('QRコードを検証中...');

    try {
      const response = await fetch(AUTH_QR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_token: token })
      });

      if (response.ok) {
        const data = await response.json();
        const userId = data.caregiver_id;
        console.log(`[KioskAuth] QR認証成功: ${userId}`);
        
        setError('');
        await auth.login(userId); // 取得したIDでログイン
        navigate('/review/staff');
      } else {
        setError('無効なQRコードです。');
      }
    } catch (err) {
      console.error('QR認証APIエラー:', err);
      setError('認証サーバーに接続できませんでした。');
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

        {/* QRログインボタン */}
        <Box sx={{ mt: 4 }}>
          <Button 
            variant="outlined" 
            size="large"
            startIcon={<QrIcon />} 
            onClick={(e) => {
              e.stopPropagation(); // コンテナのクリックイベント（focusInput）を止める
              setIsQrOpen(true);
            }}
            disabled={loading}
            sx={{ px: 4, py: 1.5 }}
          >
            QRコードでログイン
          </Button>
        </Box>

        <Box
          component="input"
          ref={hiddenInputRef}
          type="text" 
          value={inputBuffer}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={focusInput}
          autoFocus
          disabled={loading || isQrOpen} // QR中はNFC入力を無効化
          aria-label="NFCリーダー入力用"
          sx={{
            position: 'absolute',
            opacity: 0,
            top: '-1000px',
            pointerEvents: 'none' 
          }}
        />
        
        {loading && (
          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
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

      {/* QRスキャナーモーダル */}
      <QRScannerModal 
        open={isQrOpen} 
        onClose={() => setIsQrOpen(false)} 
        onScan={handleQrScan} 
      />

    </Container>
  );
};