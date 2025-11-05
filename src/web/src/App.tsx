import React, { useState, useRef } from 'react'; // ★ AudioInput のために useState/useRef が必要
import './App.css';

// ★ 1. ReduxフックとActionをインポート
import { useAppDispatch, useAppSelector } from './store/hooks';
import { 
  setStatus, 
  setTargetVoice, 
  setTestAudio, 
  setTranscription, 
  setError, 
  resetApiState 
} from './store/appSlice';

// APIから返ってくるJSONの型
interface TranscriptionSegment {
  speaker: 'TARGET' | 'OTHER';
  start: number;
  end: number;
  text: string;
}

// APIサーバーのURL
const API_URL = "http://127.0.0.1:8000/transcribe";


// ★★★★★ AudioInput コンポーネント ★★★★★
// -----------------------------------------------------------
interface AudioInputProps {
  title: string;
  fileId: string; // (target_voice / mixed_audio)
  onFileSelect: (file: Blob, fileName: string) => void;
  selectedFileName: string | null;
  disabled: boolean;
}

/**
 * 録音機能とファイルアップロード機能を担当するUIコンポーネント
 */
const AudioInput: React.FC<AudioInputProps> = ({ title, fileId, onFileSelect, selectedFileName, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ★ ファイル選択 (<input type="file">) の処理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file, file.name);
    }
    event.target.value = '';
  };

  // ★ 録音開始
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        onFileSelect(audioBlob, `${fileId}_recorded.webm`);
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("マイクへのアクセス許可が必要です。");
      console.error(err);
    }
  };

  // ★ 録音停止
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  return (
    <section>
      <h3>{title}</h3>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        {/* 録音ボタン */}
        {!isRecording ? (
          <button onClick={startRecording} disabled={disabled}>
            🎤 録音開始
          </button>
        ) : (
          <button onClick={stopRecording} style={{ color: 'red' }}>
            ■ 録音停止
          </button>
        )}

        <span>または</span>

        {/* ファイルアップロードボタン */}
        <label htmlFor={`${fileId}-upload`} className="custom-file-upload" style={{
            backgroundColor: '#f0f0f0',
            border: '1px solid #ccc',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1
        }}>
          📁 ファイル選択
        </label>
        <input 
          id={`${fileId}-upload`}
          type="file" 
          accept="audio/*" // .webm, .mp3, .wav など
          onChange={handleFileChange}
          style={{ display: 'none' }} // inputタグ自体は隠す
          disabled={disabled}
        />
      </div>
      {selectedFileName && (
        <p style={{ color: 'green' }}>✅ 準備OK: {selectedFileName}</p>
      )}
    </section>
  );
};
// -----------------------------------------------------------
// ★★★★★ AudioInput コンポーネントここまで ★★★★★


/**
 * メインのAppコンポーネント（Reduxで状態管理）
 */
function App() {
  // ★ 2. Redux から State を取得
  const dispatch = useAppDispatch();
  const { 
    status, 
    targetVoice, 
    testAudio, 
    transcription, 
    error 
  } = useAppSelector((state) => state.app);

  
  // --- 3. APIサーバーへ送信 (fetch) ---
  const handleSubmit = async () => {
    if (!targetVoice.blob || !testAudio.blob) {
      dispatch(setError("ターゲットの声と会話録音の両方が必要です。"));
      return;
    }
    
    dispatch(resetApiState());
    dispatch(setStatus('loading'));

    const formData = new FormData();
    formData.append('target_voice', targetVoice.blob, targetVoice.name || 'target_voice.webm');
    formData.append('mixed_audio', testAudio.blob, testAudio.name || 'test_audio.webm');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || `HTTPエラー: ${response.status}`);
      }

      const result = await response.json();
      dispatch(setTranscription(result.transcription as TranscriptionSegment[]));
      dispatch(setStatus('success'));
      console.log("API 成功:", result);

    } catch (err) {
      console.error("API 呼び出しエラー:", err);
      dispatch(setError(err instanceof Error ? err.message : "不明なエラーが発生しました。"));
      dispatch(setStatus('idle'));
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="App">
      <header className="App-header">
        <h1>ステップ2b: フロントエンド (Redux対応)</h1>
        
        {/* ステップ1: ターゲット録音・選択 */}
        <AudioInput
          title="1. ターゲットの声を登録"
          fileId="target_voice" //
          onFileSelect={(blob, name) => dispatch(setTargetVoice({ blob, name }))}
          selectedFileName={targetVoice.name}
          disabled={isLoading}
        />

        {/* ステップ2: 会話録音・選択 */}
        <AudioInput
          title="2. 会話（ターゲット＋他人）を録音"
          fileId="mixed_audio" //
          onFileSelect={(blob, name) => dispatch(setTestAudio({ blob, name }))}
          selectedFileName={testAudio.name}
          disabled={isLoading}
        />

        {/* ステップ3: 実行 */}
        <section>
          <h3>3. API実行</h3>
          <button 
            onClick={handleSubmit}
            disabled={!targetVoice.blob || !testAudio.blob || isLoading}
            style={{ fontSize: '1.2em', padding: '10px 20px' }}
          >
            {isLoading ? "AI処理中..." : "分離・文字起こし実行"}
          </button>
        </section> 
        {/* ★★★★★ ここが修正点 ★★★★★
            ( '> </section> ' の '>' が抜けていたのを修正)
        */}

        {/* ステップ4: 結果 */}
        <section>
          <h3>4. カルテ結果</h3>
          {error && <p style={{ color: 'red' }}>エラー: {error}</p>}
          {status === 'success' && transcription.length === 0 && (
            <p>（文字起こし結果がありませんでした）</p>
          )}
          <div style={{ textAlign: 'left', maxWidth: '600px', margin: 'auto' }}>
            {transcription.map((segment, index) => (
              <p key={index} style={{ 
                  color: segment.speaker === 'TARGET' ? '#007bff' : '#28a745',
                  fontWeight: segment.speaker === 'TARGET' ? 'bold' : 'normal' 
                }}>
                [{segment.speaker}] ({segment.start}s - {segment.end}s): {segment.text}
              </p>
            ))}
          </div>
        </section>
      </header>
    </div>
  );
}

export default App;