import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * ★ RecordPage 内で実行される「フォアグラウンド同期」処理 ★
 */
const processSyncQueue_Foreground = async (setStatusMessage: (msg: string) => void) => {
  console.log('[APP] 同期処理を開始します...');
  setStatusMessage('同期処理を開始します...');

  // ★ 修正: 相対パス (プロキシ 経由) にする
  const API_URL = `${API_BASE_URL}/upload_recording`; // -> /api/upload_recording

  try {
    const pendingRecords = await db.local_recordings.where('upload_status').equals('pending').toArray();
    if (pendingRecords.length === 0) {
      console.log('[APP] 同期対象のデータはありませんでした。');
      setStatusMessage('同期対象のデータはありません。');
      return true; // 正常終了
    }

    console.log(`[APP] ${pendingRecords.length} 件のデータをアップロードします...`);
    setStatusMessage(`同期中... ( ${pendingRecords.length} 件)`);

    const uploadPromises = pendingRecords.map(async (record) => {
      if (!record.local_id) return; // 型ガード

      const formData = new FormData();
      formData.append('caregiver_id', record.caregiver_id);
      formData.append('memo_text', record.memo_text);
      formData.append('audio_blob', record.audio_blob, 'recording.webm');
      
      try {
        // (API_URL が /api/upload_recording になっている)
        const response = await fetch(API_URL, { method: 'POST', body: formData });
        if (response.ok) {
          await db.local_recordings.update(record.local_id, { upload_status: 'uploaded' });
          console.log(`[APP] ${record.local_id} のアップロード成功。`);
        } else {
          console.error(`[APP] ${record.local_id} のアップロード失敗 (サーバーエラー):`, response.status);
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (fetchError) {
        console.error(`[APP] ${record.local_id} のアップロード失敗 (ネットワーク):`, fetchError);
        throw fetchError;
      }
    });

    await Promise.all(uploadPromises);
    
    console.log('[APP] 同期処理が完了しました。');
    setStatusMessage('同期処理が正常に完了しました。');
    return true; // 正常終了

  } catch (error) {
    console.error('[APP] 同期キューの処理中にエラーが発生しました:', error);
    // (ts(18046) 対策)
    if (error instanceof Error) {
      setStatusMessage(`エラー: 同期処理に失敗しました: ${error.message}`);
    } else {
      setStatusMessage(`エラー: 同期処理に失敗しました: ${String(error)}`);
    }
    throw error; // handleLock の catch で補足させるため throw
  }
};


export const RecordPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [memo, setMemo] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ★★★ ロックボタン押下時の処理 ★★★
  const handleLock = async () => {
    console.log('[APP] ロックボタンが押されました。');
    if (isRecording) {
      setStatusMessage('録音中はロックできません。録音を停止してください。');
      console.warn('[APP] 録音中のためロック処理を中断しました。');
      return;
    }
    
    setStatusMessage('同期処理を確認中...');
    console.log('[APP] 同期処理を確認します...');

    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('[APP] Service Worker 登録を取得しました:', registration);

      if (navigator.onLine) {
        console.log('[APP] オンラインです。フォアグラウンド同期を実行します。');
        // (ts(18046) 対策済み)
        await processSyncQueue_Foreground(setStatusMessage);
        
      } else {
        console.log('[APP] オフラインです。バックグラウンド同期をスケジュールします。');
        if (registration && registration.sync) {
          console.log('[APP] registration.sync は存在します。');
          await registration.sync.register('koeno-sync');
          console.log('[APP] Background Sync に \'koeno-sync\' タグを登録しました。');
          setStatusMessage('オフラインのため同期をスケジュールしました。');
        } else {
          console.error('[APP] registration.sync が未定義です！');
          setStatusMessage('エラー: バックグラウンド同期APIが利用できません。');
        }
      }
    } catch (err) {
      // (ts(18046) 対策済み)
      console.error('[APP] handleLock 処理全体でエラーが発生:', err);
      if (err instanceof Error) {
        // (processSyncQueue_Foreground が throw したエラーもここでキャッチ)
        setStatusMessage(`エラー: 同期処理の登録または実行に失敗しました: ${err.message}`);
      } else {
        setStatusMessage(`エラー: 同期処理の登録または実行に失敗しました: ${String(err)}`);
      }
    }

    console.log('[APP] ログアウト処理を実行し、認証ページに戻ります。');
    auth.logout();
    navigate('/'); 
  };

  // ★★★ 録音開始 ★★★
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
          setStatusMessage(`ローカル保存成功 (ID: ${currentCaregiverId})。データは同期待ちです。`);
          setMemo('');
        } catch (dbError) {
          console.error('IndexedDB 保存エラー:', dbError);
          setStatusMessage(`ローカルDBへの保存に失敗しました: ${String(dbError)}`);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage('録音中...');
    } catch (err) {
      console.error('マイクアクセスエラー:', err);
      // (ts(18046) 対策)
      if (err instanceof Error) {
        setStatusMessage(`エラー: マイクへのアクセスが許可されていません: ${err.message}`);
      } else {
        setStatusMessage('エラー: マイクへのアクセスが許可されていません。');
      }
    }
  };

  // ★★★ 録音停止 ★★★
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const displayName = auth.caregiverId ? `${auth.caregiverId}さん` : '不明';

  // --- (JSX) ---
  return (
    <div style={{ padding: '20px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5em' }}>{displayName} の記録中</h1>
        <button onClick={handleLock} style={{ color: 'red', padding: '8px' }} disabled={isRecording}>
          ロック (＆ 同期実行)
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