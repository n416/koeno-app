import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// ★ 修正: 相対パス (プロキシ 経由) にする
const AUTH_URL = `${API_BASE_URL}/authenticate`; // -> /api/authenticate

/**
 * Task 6.1 (Task 7.4 修正): PC版 認証ページ (KioskAuthPage)
 * API認証を行うようロジックを修正
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
            setError('認証に失敗しました。IDが正しくありません。');
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
    <div onClick={focusInput} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <h1>KOENO-APP レビュー（PC版）</h1>
      <p>USB-NFCリーダーをかざしてください</p>
      <p>（またはIDを手入力してEnterキーを押してください）</p>

      <input
        ref={hiddenInputRef}
        type="text"
        value={inputBuffer}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={focusInput} 
        autoFocus
        disabled={loading} // ★ 認証中は入力を無効化
        style={{
          position: 'absolute',
          opacity: 0,
          top: '-1000px',
        }}
      />
      
      {error && <p style={{ color: 'red', marginTop: '20px' }}>{error}</p>}
    </div>
  );
};