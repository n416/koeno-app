import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// ★★★ Task 2.2: MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress
} from '@mui/material';
import { Nfc as NfcIcon, Pin as PinIcon } from '@mui/icons-material'; // アイコン

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// ★ 修正: 相対パス (プロキシ 経由) にする
const AUTH_URL = `${API_BASE_URL}/authenticate`; // -> /api/authenticate

// (グローバルスコープで Web NFC API の型を定義)
declare global {
  interface Window {
    NDEFReader: any;
  }
}

export const AuthPage = () => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null); // (エラーメッセージ用にstring型に変更)
  const [isNfcAvailable, setIsNfcAvailable] = useState(false);
  
  // 'nfc' | 'pin'
  const [authMode, setAuthMode] = useState<'nfc' | 'pin'>('nfc');
  const [loading, setLoading] = useState(false); // 認証中のローディング状態
  
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if ('NDEFReader' in window) {
      setIsNfcAvailable(true);
      setAuthMode('nfc'); // デフォルトはNFC
    } else {
      setIsNfcAvailable(false);
      setAuthMode('pin'); // NFCがなければPINのみ
    }
  }, []);

  /**
   * 認証APIをコールする共通関数 (Task 7.3)
   */
  const attemptLogin = async (id: string) => {
    setLoading(true);
    setError('認証中...');
    
    // (AUTH_URL が /api/authenticate になっている)
    try {
      const response = await fetch(AUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ caregiver_id: id })
      });

      if (response.ok) {
        // ★ API認証成功
        setError(null); // エラーをクリア
        auth.login(id);
        navigate('/record'); // 認証成功
      } else {
        // ★ API認証失敗 (401 Unauthorized など)
        const errMsg = await response.text();
        setError(errMsg || '認証に失敗しました。IDが正しくありません。');
        setPin(''); // PIN入力の場合、クリアする
      }
    } catch (err) {
      // (Failed to fetch など、サーバーが落ちている場合)
      console.error('認証APIエラー:', err);
      if (err instanceof Error) {
        setError(`エラー: 認証サーバーに接続できません: ${err.message}`);
      } else {
        setError('エラー: 認証サーバーに接続できません。');
      }
    }
    setLoading(false);
  };


  // (A) Web NFC (Android)
  const handleNfcScan = async () => {
    setError('ICカードをスキャンしてください...');
    setLoading(true); // スキャン開始をローディング扱い
    
    try {
      const reader = new window.NDEFReader();

      // (イベントハンドラを scan() の *前* に登録)
      reader.onreading = async (event: any) => {
        const serialNumber = event.serialNumber;
        console.log('[NFC] カード読み取り成功:', serialNumber);
        
        if (serialNumber) {
          await attemptLogin(serialNumber); // 認証を実行
        } else {
          setError('NFC IDの読み取りに失敗しました。');
          setLoading(false);
        }
      };
      
      reader.onreadingerror = (event: any) => {
        console.error('[NFC] 読み取りエラー:', event);
        setError('NFCカードの読み取りに失敗しました。カードが非対応(NDEF非準拠)か、正しくかざされていません。');
        setLoading(false);
      };

      // (ハンドラ登録後に) スキャンを開始
      await reader.scan();

    } catch (err) {
      // (scan() 自体の起動失敗時)
      console.error('NFCスキャンエラー (catch):', err);
      if (err instanceof Error) {
        setError(`NFCスキャンの起動に失敗しました: ${err.message}`);
      } else {
        setError('NFCスキャンの起動に失敗しました。');
      }
      setLoading(false);
    }
  };

  // (B) PIN (iPhone / フォールバック)
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // フォーム送信によるリロードを防ぐ
    if (pin.length > 0) {
      await attemptLogin(pin); // 認証を実行
    } else {
      setError('PINコードを入力してください');
    }
  };

  /**
   * JSX (Task 2.2: MUI化)
   */
  return (
    <Container maxWidth="xs"> {/* スマホ画面なので xs (extra-small) を指定 */}
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          KOENO-APP 認証
        </Typography>
        
        {/* --- エラー表示エリア --- */}
        {error && (
          <Alert severity={loading ? "info" : "error"} sx={{ width: '100%', mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading && authMode === 'nfc' && <CircularProgress sx={{ mb: 2 }} />}


        {/* --- (A) NFC認証モード --- */}
        {isNfcAvailable && authMode === 'nfc' ? (
          <Box sx={{ width: '100%', mt: 2 }}>
            <Typography variant="h6" gutterBottom>ICカードでアンロック</Typography>
            <Button 
              onClick={handleNfcScan} 
              disabled={loading} 
              variant="contained"
              size="large"
              startIcon={<NfcIcon />}
              sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
            >
              ICカードのスキャンを開始
            </Button>
            
            <Button 
              onClick={() => setAuthMode('pin')} 
              disabled={loading} 
              variant="text"
              sx={{ mt: 3 }}
            >
              PINコードで認証する
            </Button>
          </Box>
        
        ) : (
      
        /* --- (B) PIN認証モード --- */
        <Box 
          component="form" 
          onSubmit={handlePinLogin} 
          sx={{ width: '100%', mt: 2 }}
        >
          <Typography variant="h6" gutterBottom>PINコードでアンロック</Typography>
          <TextField
            type="password"
            label="PINコード"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputProps={{ maxLength: 10 }}
            sx={{ width: '100%', mb: 2 }}
            disabled={loading}
            autoFocus
          />
          <Button 
            type="submit"
            onClick={handlePinLogin} 
            disabled={loading} 
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={24} /> : <PinIcon />}
            sx={{ width: '100%', height: '56px' }}
          >
            {loading ? '認証中...' : '認証'}
          </Button>

          {isNfcAvailable && (
            <Button 
              onClick={() => setAuthMode('nfc')} 
              disabled={loading} 
              variant="text"
              sx={{ mt: 3 }}
            >
              ICカードで認証する
            </Button>
          )}
        </Box>
      )}
      </Box>
    </Container>
  );
};