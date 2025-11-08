import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

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
  const [error, setError] = useState('');
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
        setError('');
        auth.login(id);
        navigate('/record'); // 認証成功
      } else {
        // ★ API認証失敗 (401 Unauthorized など)
        setError('認証に失敗しました。IDが正しくありません。');
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
  const handlePinLogin = async () => {
    if (pin.length > 0) {
      await attemptLogin(pin); // 認証を実行
    } else {
      setError('PINコードを入力してください');
    }
  };

  /**
   * JSX (Task 7.2 で修正済み)
   */
  return (
    <div>
      <h1>KOENO-APP 認証</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      {isNfcAvailable && authMode === 'nfc' ? (
        <section>
          <h2>ICカードでアンロック</h2>
          <button onClick={handleNfcScan} disabled={loading} style={{ padding: '20px', fontSize: '1.2em' }}>
            {loading ? 'スキャン中...' : 'ICカードのスキャンを開始'}
          </button>
          
          <button onClick={() => setAuthMode('pin')} disabled={loading} style={{ marginTop: '20px', background: 'transparent', border: 'none', color: 'cyan', cursor: 'pointer' }}>
            PINコードで認証する
          </button>
        </section>
      
      ) : (
      
        <section>
          <h2>PINコードでアンロック</h2>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={10}
            style={{ fontSize: '1.5em', width: '150px', marginRight: '10px' }}
            disabled={loading}
          />
          <button onClick={handlePinLogin} disabled={loading} style={{ padding: '10px' }}>
            {loading ? '認証中...' : '認証'}
          </button>

          {isNfcAvailable && (
            <button onClick={() => setAuthMode('nfc')} disabled={loading} style={{ display: 'block', margin: '20px auto', background: 'transparent', border: 'none', color: 'cyan', cursor: 'pointer' }}>
              ICカードで認証する
            </button>
          )}
        </section>
      )}
    </div>
  );
};