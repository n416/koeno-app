import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

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
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if ('NDEFReader' in window) {
      setIsNfcAvailable(true);
    }
  }, []);

  // (A) Web NFC (Android)
  const handleNfcScan = async () => {
    setError('ICカードをスキャンしてください...');
    try {
      const reader = new window.NDEFReader();
      await reader.scan();

      reader.onreading = (event: any) => {
        const serialNumber = event.serialNumber; // (仮: IDは別途デコードが必要)
        setError('');
        auth.login(serialNumber || 'nfc-user');
        navigate('/record'); // 認証成功
      };
    } catch (err) {
      console.error('NFCスキャンエラー:', err);
      setError('NFCスキャンの起動に失敗しました。');
    }
  };

  // (B) PIN (iPhone / フォールバック)
  const handlePinLogin = () => {
    // Task 2.3: 認証ロジックは仮実装
    if (pin === '1234') { 
      setError('');
      auth.login('pin-user');
      navigate('/record'); // 認証成功
    } else {
      setError('PINコードが違います');
      setPin('');
    }
  };

  return (
    <div>
      <h1>KOENO-APP 認証</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      {isNfcAvailable ? (
        <section>
          <h2>ICカードでアンロック</h2>
          <button onClick={handleNfcScan} style={{ padding: '20px', fontSize: '1.2em' }}>
            ICカードのスキャンを開始
          </button>
        </section>
      ) : (
        <section>
          <h2>PINコードでアンロック (フォールバック)</h2>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={4}
            style={{ fontSize: '1.5em', width: '100px', marginRight: '10px' }}
          />
          <button onClick={handlePinLogin} style={{ padding: '10px' }}>
            認証
          </button>
        </section>
      )}
    </div>
  );
};