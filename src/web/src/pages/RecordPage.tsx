import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

export const RecordPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  // ... (useState, useRef, startRecording, stopRecording は Task 3 のまま)
  const [isRecording, setIsRecording] = useState(false);
  const [memo, setMemo] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ★★★ Task 4: PWA(SW)に依存しない「フォアグラウンド同期」ロジック ★★★
  const processSyncQueue = async () => {
    setStatusMessage('アップロード処理中...');
    console.log('[APP] 同期処理を開始します...');
    
    try {
      // (A) 'pending' のデータを取得
      const pendingRecords = await db.local_recordings
        .where('upload_status')
        .equals('pending')
        .toArray();

      if (pendingRecords.length === 0) {
        console.log('[APP] 同期対象のデータはありませんでした。');
        setStatusMessage('アップロードするデータはありません。');
        return true; // ログアウト処理に進む
      }

      console.log(`[APP] ${pendingRecords.length} 件のデータをアップロードします...`);
      let allSuccess = true;

      for (const record of pendingRecords) {
        // (B) FormData に詰める
        const formData = new FormData();
        formData.append('caregiver_id', record.caregiver_id);
        formData.append('memo_text', record.memo_text);
        formData.append('audio_blob', record.audio_blob, 'recording.webm');

        try {
          // (C) Task 1 のエンドポイントに送信
          const response = await fetch('/upload_recording', { // API_URL
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            // (D) 成功時： 'uploaded' に更新
            await db.local_recordings.update(record.local_id!, {
              upload_status: 'uploaded',
            });
            console.log(`[APP] ${record.local_id} のアップロード成功。`);
          } else {
            console.error(`[APP] ${record.local_id} のアップロード失敗 (サーバーエラー):`, response.status);
            allSuccess = false; // 1件でも失敗したらフラグを立てる
          }
        } catch (fetchError) {
          console.error(`[APP] ${record.local_id} のアップロード失敗 (ネットワーク):`, fetchError);
          allSuccess = false; // ネットワークエラーも失敗
          break; // オフラインになった可能性が高いのでループを中断
        }
      }

      if (allSuccess) {
        setStatusMessage('すべてのデータの同期が完了しました。');
      } else {
        setStatusMessage('一部のデータの同期に失敗しました。オンライン環境で再度ロックしてください。');
      }
      return true; // ログアウト処理に進む

    } catch (dbError) {
      console.error('[APP] 同期キューの処理中に IndexedDB エラーが発生:', dbError);
      setStatusMessage('ローカルDBのエラーで同期に失敗しました。');
      return false; // ログアウト処理を中断
    }
  };

  // ★★★ Task 4.1: (A)セッション終了トリガー (修正) ★★★
  const handleLock = async () => {
    console.log('[APP] ロックボタンが押されました。');
    if (isRecording) {
      setStatusMessage('録音中はロックできません。');
      return;
    }
    
    // (B) オンライン状態 を確認
    if (navigator.onLine) {
      console.log('[APP] オンラインです。フォアグラウンド同期を実行します。');
      const syncSuccess = await processSyncQueue(); // awaitで待機
      if (!syncSuccess) return; // 同期中にエラーが起きたらログアウトしない

    } else {
      console.log('[APP] オフラインです。同期をスキップします。');
      setStatusMessage('オフラインのため同期をスキップしました。');
    }

    // 4. 同期が（成功またはスキップ）した場合のみ、セッションを破棄
    console.log('[APP] ログアウト処理を実行し、認証ページに戻ります。');
    auth.logout();
    navigate('/'); 
  };
  
  // ★★★ Task 3: 録音開始 (省略なし) ★★★
  const startRecording = async () => {
    setStatusMessage('録音準備中...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setStatusMessage('保存処理中...');
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
        const currentCaregiverId = auth.caregiverId;

        if (!currentCaregiverId) {
          setStatusMessage('エラー: セッションが切れました。ロックして再認証してください。');
          return;
        }

        try {
          await db.local_recordings.add({
            caregiver_id: currentCaregiverId,
            audio_blob: audioBlob,
            memo_text: memo,
            upload_status: 'pending',
            created_at: new Date(),
          });
          setStatusMessage(`保存成功 (ID: ${currentCaregiverId})。データはローカルにあります。`);
          setMemo('');
        } catch (dbError) {
          console.error('IndexedDB 保存エラー:', dbError);
          setStatusMessage(`ローカルDBへの保存に失敗しました: ${dbError}`);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage('録音中...');
    } catch (err) {
      console.error('マイクアクセスエラー:', err);
      setStatusMessage('エラー: マイクへのアクセスが許可されていません。');
    }
  };

  // ★★★ Task 3: 録音停止 (省略なし) ★★★
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  const displayName = auth.caregiverId ? `${auth.caregiverId}さん` : '不明';

  // --- (JSX - 変更なし) ---
  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5em' }}>{displayName} の記録中</h1>
        <button onClick={handleLock} style={{ color: 'red', padding: '8px' }} disabled={isRecording}>
          ロック (＆ 同期開始)
        </button>
      </header>
      
      {isRecording && <p style={{ color: 'orange' }}>録音中はロックできません</p>}

      <section style={{ marginBottom: '20px' }}>
        {!isRecording ? (
          <button onClick={startRecording} style={{ padding: '15px', fontSize: '1.2em', width: '100%' }}>🎤 録音開始</button>
        ) : (
          <button onClick={stopRecording} style={{ padding: '15px', fontSize: '1.2em', width: '100%', color: 'red', borderColor: 'red' }}>■ 録音停止 ＆ 保存</button>
        )}
      </section>
      <section>
        <label htmlFor="memo"><h3>関連メモ</h3></label>
        <textarea id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={5} style={{ width: '100%', fontSize: '1em', padding: '10px' }} placeholder="録音内容に関するメモを入力..." disabled={isRecording} />
      </section>
      {statusMessage && (<p style={{ color: 'green', marginTop: '20px', textAlign: 'center' }}>{statusMessage}</p>)}
    </div>
  );
};