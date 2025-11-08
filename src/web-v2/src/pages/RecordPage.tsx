import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

// ★★★ Task 2.2: MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Button,
  TextField,
  Typography,
  AppBar,
  Toolbar,
  // IconButton, (Button に startIcon を使うため不要に)
  Snackbar,
  Alert,
  // AlertColor, (型なのでここから削除)
} from '@mui/material';
// ★★★ 修正: AlertColor は 'type' としてインポート ★★★
import type { AlertColor } from '@mui/material/Alert'; 
import {
  Lock as LockIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  Warning as WarningIcon
} from '@mui/icons-material';

// .env から API のベース URL を取得 ( "/api" または undefined が入る)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * ★ RecordPage 内で実行される「フォアグラウンド同期」処理 ★
 */
// (setStatusMessage の型を変更)
const processSyncQueue_Foreground = async (
  setStatus: (message: string, severity: AlertColor) => void
) => {
  console.log('[APP] 同期処理を開始します...');
  setStatus('同期処理を開始します...', 'info');

  // ★ 修正: 相対パス (プロキシ 経由) にする
  const API_URL = `${API_BASE_URL}/upload_recording`; // -> /api/upload_recording

  try {
    const pendingRecords = await db.local_recordings.where('upload_status').equals('pending').toArray();
    if (pendingRecords.length === 0) {
      console.log('[APP] 同期対象のデータはありませんでした。');
      setStatus('同期対象のデータはありません。', 'success');
      return true; // 正常終了
    }

    console.log(`[APP] ${pendingRecords.length} 件のデータをアップロードします...`);
    setStatus(`同期中... ( ${pendingRecords.length} 件)`, 'info');

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
    setStatus('同期処理が正常に完了しました。', 'success');
    return true; // 正常終了

  } catch (error) {
    console.error('[SW] 同期キューの処理中にエラーが発生しました:', error);
    // (ts(18046) 対策)
    if (error instanceof Error) {
      setStatus(`エラー: 同期処理に失敗しました: ${error.message}`, 'error');
    } else {
      setStatus(`エラー: 同期処理に失敗しました: ${String(error)}`, 'error');
    }
    throw error; // handleLock の catch で補足させるため throw
  }
};


export const RecordPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [memo, setMemo] = useState('');
  
  // ★★★ Task 2.2: Snackbar用のState ★★★
  const [statusMessage, setStatusMessage] = useState('');
  const [statusSeverity, setStatusSeverity] = useState<AlertColor>('info');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ★★★ Task 2.2: setStatus 関数を定義 ★★★
  const setStatus = (message: string, severity: AlertColor) => {
    setStatusMessage(message);
    setStatusSeverity(severity);
    setIsStatusOpen(true);
  };
  const closeStatus = () => {
    setIsStatusOpen(false);
  };


  // ★★★ ロックボタン押下時の処理 ★★★
  const handleLock = async () => {
    console.log('[APP] ロックボタンが押されました。');
    if (isRecording) {
      setStatus('録音中はロックできません。録音を停止してください。', 'warning');
      console.warn('[APP] 録音中のためロック処理を中断しました。');
      return;
    }
    
    setStatus('同期処理を確認中...', 'info');
    console.log('[APP] 同期処理を確認します...');

    try {
      const registration = await navigator.serviceWorker.ready;
      console.log('[APP] Service Worker 登録を取得しました:', registration);

      if (navigator.onLine) {
        console.log('[APP] オンラインです。フォアグラウンド同期を実行します。');
        // (ts(18046) 対策済み)
        await processSyncQueue_Foreground(setStatus);
        
      } else {
        console.log('[APP] オフラインです。バックグラウンド同期をスケジュールします。');
        if (registration && registration.sync) {
          console.log('[APP] registration.sync は存在します。');
          await registration.sync.register('koeno-sync');
          console.log('[APP] Background Sync に \'koeno-sync\' タグを登録しました。');
          setStatus('オフラインのため同期をスケジュールしました。', 'info');
        } else {
          console.error('[APP] registration.sync が未定義です！');
          setStatus('エラー: バックグラウンド同期APIが利用できません。', 'error');
        }
      }
    } catch (err) {
      // (ts(18046) 対策済み)
      console.error('[APP] handleLock 処理全体でエラーが発生:', err);
      if (err instanceof Error) {
        // (processSyncQueue_Foreground が throw したエラーもここでキャッチ)
        setStatus(`エラー: 同期処理の登録または実行に失敗しました: ${err.message}`, 'error');
      } else {
        setStatus(`エラー: 同期処理の登録または実行に失敗しました: ${String(err)}`, 'error');
      }
    }

    console.log('[APP] ログアウト処理を実行し、認証ページに戻ります。');
    auth.logout();
    navigate('/'); 
  };

  // ★★★ 録音開始 ★★★
  const startRecording = async () => {
    setStatus('録音準備中...', 'info');
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
        setStatus('保存処理中...', 'info');
        const audioBlob = new Blob(audioChunksRef.current, { type: options.mimeType });
        const currentCaregiverId = auth.caregiverId;

        if (!currentCaregiverId) {
          setStatus('エラー: セッションが切れました。ロックして再認証してください。', 'error');
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
          setStatus(`ローカル保存成功。データは同期待ちです。`, 'success');
          setMemo('');
        } catch (dbError) {
          console.error('IndexedDB 保存エラー:', dbError);
          setStatus(`ローカルDBへの保存に失敗しました: ${String(dbError)}`, 'error');
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setStatus('録音中...', 'info');
    } catch (err) {
      console.error('マイクアクセスエラー:', err);
      // (ts(18046) 対策)
      if (err instanceof Error) {
        setStatus(`エラー: マイクへのアクセスが許可されていません: ${err.message}`, 'error');
      } else {
        setStatus('エラー: マイクへのアクセスが許可されていません。', 'error');
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
    // ★★★ Task 2.2: MUI化 ★★★
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      
      {/* --- 1. ヘッダー --- */}
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {displayName} の記録中
          </Typography>
          <Button 
            color="inherit" 
            onClick={handleLock} 
            disabled={isRecording}
            startIcon={<LockIcon />}
          >
            ロック (＆ 同期)
          </Button>
        </Toolbar>
      </AppBar>
      
      {/* --- 2. メインコンテンツ --- */}
      <Container maxWidth="md" sx={{ flexGrow: 1, py: 3, display: 'flex', flexDirection: 'column' }}>
        
        {isRecording && (
          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
            録音中はロックできません
          </Alert>
        )}

        {/* --- 録音ボタン --- */}
        <Box sx={{ mb: 3 }}>
          {!isRecording ? (
            <Button 
              onClick={startRecording} 
              variant="contained" 
              color="primary"
              startIcon={<MicIcon />}
              sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
            >
              録音開始
            </Button>
          ) : (
            <Button 
              onClick={stopRecording} 
              variant="contained" 
              color="error"
              startIcon={<StopIcon />}
              sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
            >
              録音停止 ＆ 保存
            </Button>
          )}
        </Box>
        
        {/* --- メモ帳 --- */}
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" component="label" htmlFor="memo" gutterBottom>
            関連メモ
          </Typography>
          <TextField 
            id="memo" 
            value={memo} 
            onChange={(e) => setMemo(e.target.value)} 
            multiline
            rows={5} // (デフォルトの行数)
            placeholder="録音内容に関するメモを入力..." 
            disabled={isRecording}
            sx={{ 
              width: '100%', 
              flexGrow: 1, // 残りの高さを埋める
              '& .MuiInputBase-root': {
                 height: '100%' // TextFieldの高さをBoxに合わせる
              },
              '& .MuiInputBase-input': {
                 height: '100% !important' // 入力エリアの高さを強制
              }
            }}
          />
        </Box>
      </Container>
      
      {/* --- 3. ステータス通知 (Snackbar) --- */}
      <Snackbar 
        open={isStatusOpen} 
        autoHideDuration={6000} 
        onClose={closeStatus}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={closeStatus} severity={statusSeverity} sx={{ width: '100%' }}>
          {statusMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};