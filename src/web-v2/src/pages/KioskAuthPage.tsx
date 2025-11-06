import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

/**
 * Task 6.1: PC版 認証ページ (KioskAuthPage)
 * USB接続のNFCリーダー (キーボードエミュレート型) を想定。
 * 隠しInputでキー入力を受け付け、Enterキーで認証を試みる。
 */
export const KioskAuthPage = () => {
  const [inputBuffer, setInputBuffer] = useState('');
  const [error, setError] = useState('');
  const auth = useAuth();
  const navigate = useNavigate();
  
  // 常にフォーカスを当てるための隠しInput
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // 画面がクリックされたら、常に隠しInputにフォーカスを戻す
  const focusInput = () => {
    if (hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  useEffect(() => {
    // コンポーネントマウント時にフォーカス
    focusInput();
  }, []);

  // ★★★ 修正箇所 ★★★
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enterキーが押された場合のみ処理
    if (e.key === 'Enter') {
      const trimmedId = inputBuffer.trim(); // (inputBuffer は onChange でセットされている)
      
      if (trimmedId.length > 0) {
        console.log(`[KioskAuth] ID取得: ${trimmedId}`);
        setError('');
        auth.login(trimmedId); // 取得したIDでログイン
        navigate('/review/dashboard'); // ダッシュボードへ
      } else {
        setError('IDが入力されていません');
      }
      setInputBuffer(''); // バッファをクリア
    }
    
    // "else" (Enter以外のキー) は、onChangeが処理するため、ここでは何もしない
    // (以前はここで setInputBuffer(prev => prev + e.key) が呼ばれていたのがバグの原因)
  };
  // ★★★ 修正ここまで ★★★

  // Inputの値が変更されたときのハンドラ (手入力 ＆ NFCリーダー入力)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     // すべての入力(NFCリーダー含む)は onChange でバッファに反映させる
     setInputBuffer(e.target.value);
  };

  return (
    <div onClick={focusInput} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <h1>KOENO-APP レビュー（PC版）</h1>
      <p>USB-NFCリーダーをかざしてください</p>
      <p>（またはIDを手入力してEnterキーを押してください）</p>

      {/* onChange: すべての文字入力を受け取る (NFCリーダー含む)
        onKeyDown: Enterキーの押下だけを検知する
      */}
      <input
        ref={hiddenInputRef}
        type="text"
        value={inputBuffer}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={focusInput} // フォーカスが外れたら即座に戻す
        autoFocus
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