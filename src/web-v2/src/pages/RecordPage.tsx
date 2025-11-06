import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * ★ RecordPage 内で実行される「フォアグラウンド同期」処理 ★
 * (sw.ts の processSyncQueue とロジックはほぼ同じだが、
 * こちらは即時実行され、コンポーネントの状態 (setStatusMessage) を更新する)
 */
const processSyncQueue_Foreground = async (setStatusMessage: (msg: string) => void) => {
  console.log('[APP] 同期処理を開始します...');
  setStatusMessage('同期処理を開始します...');

  if (!API_BASE_URL) {
    console.error('[APP] VITE_API_BASE_URL が設定されていません。');
    setStatusMessage('エラー: API設定がありません。');
    return false; // エラーで中断
  }

  const API_URL = `${API_BASE_URL}/upload_recording`;

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
        const response = await fetch(API_URL, { method: 'POST', body: formData });
        if (response.ok) {
          await db.local_recordings.update(record.local_id, { upload_status: 'uploaded' });
          console.log(`[APP] ${record.local_id} のアップロード成功。`);
        } else {
          // 404 や 500 エラー
          console.error(`[APP] ${record.local_id} のアップロード失敗 (サーバーエラー):`, response.status);
          throw new Error(`Server error: ${response.status}`); // Promise.all で catch させる
        }
      } catch (fetchError) {
        // ネットワークエラー (APIサーバーが落ちている場合など)
        console.error(`[APP] ${record.local_id} のアップロード失敗 (ネットワーク):`, fetchError);
        throw fetchError; // Promise.all で catch させる
      }
    });

    await Promise.all(uploadPromises);
    
    console.log('[APP] 同期処理が完了しました。');
    setStatusMessage('同期処理が正常に完了しました。');
    return true; // 正常終了

  } catch (error) {
    console.error('[APP] 同期キューの処理中にエラーが発生しました:', error);
    setStatusMessage(`エラー: 同期処理に失敗しました: ${error.message}`);
    return false; // エラーで中断
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
      // 1. まず Service Worker の登録を取得
      const registration = await navigator.serviceWorker.ready;
      console.log('[APP] Service Worker 登録を取得しました:', registration);

      // 2. オンラインかどうかで処理を分岐
      if (navigator.onLine) {
        // ★ オンラインの場合: 即座にフォアグラウンド同期を実行
        console.log('[APP] オンラインです。フォアグラウンド同期を実行します。');
        await processSyncQueue_Foreground(setStatusMessage);
        // (フォアグラウンド同期の成否に関わらず、ログアウトは実行する)
      } else {
        // ★ オフラインの場合: Background Sync をスケジュール
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
      console.error('[APP] handleLock の Service Worker 処理全体でエラーが発生:', err);
      setStatusMessage(`エラー: 同期処理の登録に失敗しました: ${err.message}`);
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
      const options = { mimeType: 'audio/webm' }; // audio/ogg;codecs=opus や audio/mp4 も候補
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
          // IndexedDB に 'pending' ステータスで保存
          await db.local_recordings.add({
            caregiver_id: currentCaregiverId,
            audio_blob: audioBlob,
            memo_text: memo,
            upload_status: 'pending',
            created_at: new Date(),
          });
          setStatusMessage(`ローカル保存成功 (ID: ${currentCaregiverId})。データは同期待ちです。`);
          setMemo(''); // メモ欄をクリア
        } catch (dbError) {
          console.error('IndexedDB 保存エラー:', dbError);
          setStatusMessage(`ローカルDBへの保存に失敗しました: ${dbError}`);
        }
        
        stream.getTracks().forEach(track => track.stop()); // マイクを解放
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage('録音中...');
    } catch (err) {
      console.error('マイクアクセスエラー:', err);
      setStatusMessage('エラー: マイクへのアクセスが許可されていません。');
    }
  };

  // ★★★ 録音停止 ★★★
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // (onstop イベントハンドラが自動的に呼ばれ、保存処理が実行される)
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