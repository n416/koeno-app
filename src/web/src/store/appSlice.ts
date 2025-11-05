import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

// API結果 の型
interface TranscriptionSegment {
  speaker: 'TARGET' | 'OTHER';
  start: number;
  end: number;
  text: string;
}

// 状態（State）の型
interface AppState {
  status: 'idle' | 'loading' | 'success';
  targetVoice: { blob: Blob | null; name: string | null };
  testAudio: { blob: Blob | null; name: string | null };
  transcription: TranscriptionSegment[];
  error: string | null;
}

const initialState: AppState = {
  status: 'idle',
  targetVoice: { blob: null, name: null },
  testAudio: { blob: null, name: null },
  transcription: [],
  error: null,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    // 録音・アップロード状態の更新
    setStatus: (state, action: PayloadAction<'idle' | 'loading' | 'success'>) => {
      state.status = action.payload;
    },
    // ファイルのセット
    setTargetVoice: (state, action: PayloadAction<{ blob: Blob; name: string }>) => {
      state.targetVoice = action.payload;
    },
    setTestAudio: (state, action: PayloadAction<{ blob: Blob; name: string }>) => {
      state.testAudio = action.payload;
    },
    // API結果のセット
    setTranscription: (state, action: PayloadAction<TranscriptionSegment[]>) => {
      state.transcription = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    // 状態のリセット
    resetApiState: (state) => {
      state.status = 'idle';
      state.transcription = [];
      state.error = null;
    },
  },
});

export const {
  setStatus,
  setTargetVoice,
  setTestAudio,
  setTranscription,
  setError,
  resetApiState,
} = appSlice.actions;

export default appSlice.reducer;