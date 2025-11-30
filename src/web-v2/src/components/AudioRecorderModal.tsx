import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  Mic as MicIcon,
  Stop as StopIcon,
  Close as CloseIcon,
  CloudUpload as UploadIcon
} from '@mui/icons-material';

import { useAuth } from '../contexts/AuthContext';

// .env から API のベース URL を取得
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
// プロキシ経由のパス (/api/upload_recording)
const UPLOAD_URL = (API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`) + '/upload_recording';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const AudioRecorderModal: React.FC<Props> = ({ open, onClose, onUploadSuccess }) => {
  const auth = useAuth();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // モーダルが開くたびにリセット
  useEffect(() => {
    if (open) {
      resetState();
    } else {
      cleanup();
    }
  }, [open]);

  const resetState = () => {
    setIsRecording(false);
    setIsUploading(false);
    setRecordingSeconds(0);
    setError(null);
    setStatusMessage('');
    audioChunksRef.current = [];
  };

  const cleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    setError(null);
    setStatusMessage('マイク起動中...');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 一般的なブラウザ互換性の高い形式を指定
      const options = { mimeType: 'audio/webm' }; 
      const recorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        await handleUpload();
      };

      recorder.start();
      setIsRecording(true);
      setStatusMessage('録音中...');

      // タイマー開始
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error(err);
      setError('マイクへのアクセスに失敗しました。設定を確認してください。');
      setStatusMessage('');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setStatusMessage('アップロード準備中...');
    }
  };

  const handleUpload = async () => {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const currentCaregiverId = auth.caregiverId;

    if (!currentCaregiverId) {
      setError('認証エラー: 再ログインしてください。');
      return;
    }

    setIsUploading(true);
    setStatusMessage('サーバーへ送信中...');

    try {
      const formData = new FormData();
      formData.append('caregiver_id', currentCaregiverId);
      formData.append('memo_text', ''); // メモは空で送信
      formData.append('audio_blob', blob, 'pc_recording.webm');
      // サーバー側 (main.py) が期待する ISO 形式の日時
      formData.append('created_at_iso', new Date().toISOString());

      const res = await fetch(UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Server Error: ${res.status}`);
      }

      setStatusMessage('完了しました！');
      
      // 少し待ってから閉じる
      setTimeout(() => {
        onUploadSuccess(); // 親コンポーネントに通知（リスト更新など）
        onClose();
      }, 800);

    } catch (err) {
      console.error(err);
      setError('アップロードに失敗しました。サーバーの状態を確認してください。');
      setIsUploading(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <Dialog open={open} onClose={isRecording || isUploading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        新規録音
        {!isRecording && !isUploading && (
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        )}
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, gap: 2 }}>
          
          {/* タイマー表示 */}
          <Typography variant="h2" sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: isRecording ? 'error.main' : 'text.secondary' }}>
            {formatTime(recordingSeconds)}
          </Typography>

          {/* コントロールボタン */}
          <Box>
            {!isRecording && !isUploading && (
              <Button
                variant="contained"
                color="error"
                size="large"
                onClick={startRecording}
                startIcon={<MicIcon />}
                sx={{ borderRadius: 20, px: 4, py: 1.5, fontSize: '1.1rem' }}
              >
                録音開始
              </Button>
            )}

            {isRecording && (
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={stopRecording}
                startIcon={<StopIcon />}
                sx={{ borderRadius: 20, px: 4, py: 1.5, fontSize: '1.1rem' }}
              >
                録音終了
              </Button>
            )}
            
            {isUploading && (
               <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <CircularProgress size={40} sx={{ mb: 2 }} />
               </Box>
            )}
          </Box>
          
          <Typography variant="body1" sx={{ fontWeight: 'bold', minHeight: '1.5em' }}>
            {statusMessage}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>
          )}

        </Box>
      </DialogContent>
    </Dialog>
  );
};