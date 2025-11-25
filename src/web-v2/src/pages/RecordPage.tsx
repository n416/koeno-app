import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db';
import { useNavigate } from 'react-router-dom';

// ★★★ [PO 2.1][PO 2.3] MUIコンポーネントをインポート ★★★
import {
  Container,
  Box,
  Button,
  // TextField, (PO 2.1: メモ削除により不要)
  Typography,
  AppBar,
  Toolbar,
  Snackbar,
  Alert,
} from '@mui/material';
// ★★★ 修正: AlertColor は 'type' としてインポート ★★★
import type { AlertColor } from '@mui/material/Alert'; 
import {
  Lock as LockIcon,
  // Mic as MicIcon, (PO 2.1: 削除)
  // Stop as StopIcon, (PO 2.1: 削除)
  Warning as WarningIcon, // (エラー表示用に維持)
  Pause as PauseIcon, // ★ [PO 2.3] 一時停止アイコン
  PlayArrow as PlayArrowIcon // ★ [PO 2.3] 再開アイコン
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
      formData.append('memo_text', record.memo_text); // (v2.2では空文字)
      formData.append('audio_blob', record.audio_blob, 'recording.webm');
      
      // ★★★ タイムゾーン修正 ★★★
      // (Date オブジェクトを ISO 文字列に変換して送信)
      formData.append('created_at_iso', record.created_at.toISOString()); 
      
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
  // const [memo, setMemo] = useState(''); // ★ [PO 2.1] メモ削除
  
  // ★ [PO 2.3] 一時停止状態
  const [isPaused, setIsPaused] = useState(false);
  // ★ [PO 2.4] ロック処理中の状態
  const [isLocking, setIsLocking] = useState(false);

  // ★★★ Task 2.2: Snackbar用のState ★★★
  const [statusMessage, setStatusMessage] = useState('');
  const [statusSeverity, setStatusSeverity] = useState<AlertColor>('info');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ★ [PO 2.4] stopRecording が DB 保存 (onstop) を待機するための Promise リゾルバ
  const onStopPromiseResolverRef = useRef<((value: void | PromiseLike<void>) => void) | null>(null);

  // ★★★ Task 2.2: setStatus 関数を定義 ★★★
  const setStatus = (message: string, severity: AlertColor) => {
    setStatusMessage(message);
    setStatusSeverity(severity);
    setIsStatusOpen(true);
  };
  const closeStatus = () => {
    setIsStatusOpen(false);
  };


  // ★★★ [PO 2.4] ロックボタン押下時の処理 (修正) ★★★
  const handleLock = async () => {
    console.log('[APP] ロックボタンが押されました。');
    setIsLocking(true); // ★ ロック処理開始

    try {
      // ★ [PO 2.4] 録音中（または一時停止中）であれば、先に録音を停止・保存する
      if (isRecording) {
        setStatus('録音を停止・保存しています...', 'info');
        console.log('[APP] 録音中のため、停止処理を優先します。');
        
        // ★ [PO 2.4] 修正された stopRecording (Promise) を待機
        await stopRecording(); 
        
        setStatus('最終データを保存しました。同期処理を開始します...', 'info');
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
        // ★ ログアウト処理は finally で行うため、ここでは throw しない
      }

    } catch (err) {
       // (主に stopRecording で失敗した場合)
       console.error('[APP] handleLock (stop/sync) 処理で予期せぬエラー:', err);
       if (err instanceof Error) {
         setStatus(`エラー: 停止または同期に失敗しました: ${err.message}`, 'error');
       } else {
         setStatus(`エラー: 停止または同期に失敗: ${String(err)}`, 'error');
       }
    } finally {
      // ★ [PO 2.4] 同期処理の成否に関わらず、ログアウトは実行する
      console.log('[APP] ログアウト処理を実行し、認証ページに戻ります。');
      auth.logout();
      navigate('/'); 
      setIsLocking(false); // ★ ロック処理完了
    }
  };

  // ★★★ [PO 2.2] 録音開始 (v2.2改修) ★★★
  const startRecording = async () => {
    // (isRecording チェックは useEffect で代用)
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

      // ★ [PO 2.3] 一時停止・再開イベント
      recorder.onpause = () => {
        setIsPaused(true);
        setStatus('録音一時停止中', 'warning');
        console.log('[REC] 録音一時停止');
      };
      recorder.onresume = () => {
        setIsPaused(false);
        setStatus('録音中...', 'info');
        console.log('[REC] 録音再開');
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
            memo_text: '', // ★ [PO 2.1] メモ削除 (空文字を保存)
            upload_status: 'pending',
            // ★★★ タイムゾーン修正: JSTの Date オブジェクトを保存 ★★★
            created_at: new Date(), 
          });
          setStatus(`ローカル保存成功。データは同期待ちです。`, 'success');
          // setMemo(''); // ★ [PO 2.1] メモ削除
        } catch (dbError) {
          console.error('IndexedDB 保存エラー:', dbError);
          setStatus(`ローカルDBへの保存に失敗しました: ${String(dbError)}`, 'error');
        }
        
        stream.getTracks().forEach(track => track.stop());
        
        // ★ [PO 2.4] handleLock 用の Promise を解決
        if (onStopPromiseResolverRef.current) {
          onStopPromiseResolverRef.current();
          onStopPromiseResolverRef.current = null;
        }
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

  // ★★★ [PO 2.4] 録音停止 (Promise化) ★★★
  const stopRecording = () => {
    return new Promise<void>((resolve) => {
      // ★ [PO 2.4] 録音中 または 一時停止中 の両方に対応
      if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
        
        // [onstop] ハンドラが完了したときに resolve が呼ばれるようにセット
        onStopPromiseResolverRef.current = resolve; 
        
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsPaused(false);
      } else {
        // 録音していない場合は、すぐに解決
        resolve(); 
      }
    });
  };
  
  // ★★★ [PO 2.3] 一時停止・再開ハンドラ ★★★
  const handlePause = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };
  
  const handleResume = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
  };

  // ★★★ [PO 2.2] 録音の自動開始 ★★★
  useEffect(() => {
    // マウント時に録音を自動開始
    startRecording();
    
    // (クリーンアップ: コンポーネントがアンマウントされる＝通常はロック時)
    return () => {
      // 既に停止していれば stopRecording() は何もしない
      stopRecording(); 
    };
  }, []); // (空の依存配列でマウント時に1回だけ実行)


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
            // ★ [PO 2.4] 録音中でもロック可能に。多重実行のみ防止
            disabled={isLocking}
            startIcon={<LockIcon />}
          >
            {isLocking ? '処理中...' : 'ロック (＆ 同期)'}
          </Button>
        </Toolbar>
      </AppBar>
      
      {/* --- 2. メインコンテンツ --- */}
      <Container maxWidth="md" sx={{ flexGrow: 1, py: 3, display: 'flex', flexDirection: 'column' }}>
        
        {/* ★ [PO 2.1] 「録音中はロックできません」アラートを削除 */}

        {/* ★★★ [PO 2.1][PO 2.3] 録音ボタン (v2.2仕様) ★★★ */}
        <Box sx={{ mb: 3 }}>
          {isRecording && !isPaused && (
            <Button 
              onClick={handlePause} 
              variant="contained" 
              color="warning" // (一時停止は警告色)
              startIcon={<PauseIcon />}
              sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
            >
              一時停止
            </Button>
          )}
          {isRecording && isPaused && (
            <Button 
              onClick={handleResume} 
              variant="contained" 
              color="primary" // (再開はプライマリ色)
              startIcon={<PlayArrowIcon />}
              sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
            >
              録音再開
            </Button>
          )}
          {/* (録音開始前のローディング/エラー状態) */}
          {!isRecording && (
             <Button 
               variant="outlined" 
               disabled 
               sx={{ width: '100%', height: '80px', fontSize: '1.2em' }}
               startIcon={statusSeverity === 'error' ? <WarningIcon /> : null}
             >
               {statusSeverity === 'error' ? 'エラー (マイク不可)' : '録音準備中...'}
             </Button>
          )}
        </Box>
        
        {/* ★★★ [PO 2.1] メモ帳 削除 ★★★ */}
        
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